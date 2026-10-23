#!/usr/bin/env python3
"""Deploy the production app only, with backups, validation, and image rollback.

Run on the deployment host after the restricted SSH wrapper selects the exact
production commit. Database initialization, seeding, and volume changes are never
part of this workflow. A schema change requires a separately reviewed migration.
"""

import argparse
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid

APP = "partnerships-app"
DATABASE = "partnerships-db"
PROJECT = "partnership-app"
START = ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3101"]
PRESERVED_KEYS = (
    "DATABASE_URL", "BETTER_AUTH_SECRET", "PASSWORD_HASH_ENCRYPTION_KEY",
    "TERRITORY_TRANSPORT_KEY", "NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY",
)
ROOT = Path(__file__).resolve().parents[1]


def output(args):
    """Capture command output without exposing configuration or credentials."""
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def inspect(container):
    return json.loads(output(["docker", "inspect", container]))[0]


def environment(container):
    return dict(item.split("=", 1) for item in container["Config"]["Env"])


def validate_environment(previous, desired):
    for key in PRESERVED_KEYS:
        if not previous.get(key) or previous.get(key) != desired.get(key):
            raise RuntimeError("Refusing to change production setting: " + key)
    if desired["TERRITORY_TRANSPORT_KEY"] != desired["NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY"]:
        raise RuntimeError("Transport key mismatch")


def write_private(path, contents):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(contents)


def override_contents(image):
    return json.dumps({"services": {"app": {"image": image, "command": START}}}, indent=2) + "\n"


def compose(override, *arguments, capture=False):
    command = ["docker", "compose", "--project-name", PROJECT,
               "--project-directory", str(ROOT), "-f", str(ROOT / "docker-compose.yml"),
               "-f", str(override), *arguments]
    if capture:
        return output(command)
    subprocess.run(command, cwd=ROOT, check=True)


def dump_database():
    command = ('export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump -uroot '
               '--single-transaction --quick --skip-comments --order-by-primary '
               '--hex-blob --routines --events --triggers --no-tablespaces '
               '--set-gtid-purged=OFF "$MYSQL_DATABASE"')
    return subprocess.check_output(["docker", "exec", DATABASE, "sh", "-c", command])


def check_http(container, path, expected):
    javascript = """
(async () => {
  const response = await fetch('http://127.0.0.1:3101' + process.argv[1], {
    redirect: 'manual', headers: { 'x-forwarded-proto': 'https' },
    signal: AbortSignal.timeout(5000)
  });
  const text = await response.text();
  console.log(JSON.stringify({status: response.status,
    login: text.includes('Welcome back'), location: response.headers.get('location')}));
})().catch(() => process.exit(1));
"""
    data = json.loads(output(["docker", "exec", container, "node", "-e", javascript, path]))
    if data["status"] != expected:
        raise RuntimeError("HTTP check failed: " + path)
    if path == "/login" and not data["login"]:
        raise RuntimeError("Login page is missing")
    if expected == 307 and "/login" not in (data["location"] or ""):
        raise RuntimeError("Authentication redirect missing: " + path)


def wait_ready(container):
    for attempt in range(30):
        try:
            check_http(container, "/login", 200)
            return
        except (subprocess.CalledProcessError, RuntimeError, json.JSONDecodeError):
            if not inspect(container)["State"]["Running"]:
                raise RuntimeError("App container exited before becoming ready")
            time.sleep(1)
    raise RuntimeError("App did not become ready")


def check_routes(container):
    for path in ["/admin", "/admin/users", "/admin/areas", "/admin/territories", "/workspace"]:
        check_http(container, path, 307)
    check_http(container, "/api/territories", 401)


def deploy(commit):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("Expected a full production commit")
    if output(["git", "branch", "--show-current"]) != "production":
        raise RuntimeError("Deployment checkout must be on production")
    if output(["git", "rev-parse", "HEAD"]) != commit:
        raise RuntimeError("Checkout does not match the Jenkins build")
    for name in [".env", ".env.seed.local", "seed-territories.local.json"]:
        if not (ROOT / name).is_file():
            raise RuntimeError("Missing production file: " + name)

    old_app, old_db = inspect(APP), inspect(DATABASE)
    schema_hash = hashlib.sha256((ROOT / "prisma/schema.prisma").read_bytes()).hexdigest()
    running_schema = output(["docker", "exec", APP, "sha256sum", "/app/prisma/schema.prisma"]).split()[0]
    if schema_hash != running_schema:
        raise RuntimeError("Schema differs from production; review a migration separately")

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release = ROOT / ".deploy" / "production" / f"{stamp}-{commit[:12]}-{uuid.uuid4().hex[:6]}"
    release.mkdir(parents=True, mode=0o700)
    os.chmod(ROOT / ".deploy", 0o700)
    image = f"partnership-app:production-{commit[:12]}-{release.name[-6:]}"
    rollback_image = "partnership-app:rollback-" + release.name
    override = release / "app.override.yml"
    write_private(override, override_contents(image))
    desired = json.loads(compose(override, "config", "--format", "json", capture=True))["services"]["app"]["environment"]
    validate_environment(environment(old_app), desired)
    if not desired.get("BETTER_AUTH_URL", "").startswith("https://"):
        raise RuntimeError("Production authentication URL must use HTTPS")
    if desired.get("NEXT_PUBLIC_BETTER_AUTH_URL") != desired.get("BETTER_AUTH_URL"):
        raise RuntimeError("Client and server authentication URLs must match")

    for name in [".env", ".env.seed.local", "docker-compose.override.yml"]:
        if (ROOT / name).exists():
            shutil.copy2(ROOT / name, release / (name + ".before"))
            os.chmod(release / (name + ".before"), 0o600)
    subprocess.run(["docker", "image", "tag", old_app["Image"], rollback_image], check=True)
    print("Building production image for " + commit, flush=True)
    compose(override, "build", "app")
    check_client = """
const fs = require('fs'), crypto = require('crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const client = new PrismaClient();
if (!Prisma.dmmf.datamodel.models.some(model => model.name === 'User')) process.exit(1);
console.log(crypto.createHash('sha256').update(fs.readFileSync('/app/prisma/schema.prisma')).digest('hex'));
client.$disconnect();
"""
    built_schema = output(["docker", "run", "--rm", "--network", "none", "--entrypoint", "node", image, "-e", check_client])
    if built_schema != schema_hash:
        raise RuntimeError("Built image schema/client is inconsistent")

    candidate = "partnerships-candidate-" + release.name[-6:]
    env_file = release / "candidate.env"
    if any("\n" in str(value) or "\r" in str(value) for value in desired.values()):
        raise RuntimeError("Multiline runtime environment requires explicit review")
    write_private(env_file, "\n".join(f"{key}={value}" for key, value in desired.items()) + "\n")
    switched = False
    try:
        network = next(iter(old_app["NetworkSettings"]["Networks"]))
        subprocess.run(["docker", "run", "--detach", "--name", candidate,
                        "--network", network, "--env-file", str(env_file), image, *START], check=True)
        wait_ready(candidate)
        check_routes(candidate)
        before = dump_database()
        with gzip.open(release / "database-before.sql.gz", "wb") as stream:
            stream.write(before)
        os.chmod(release / "database-before.sql.gz", 0o600)
        before_hash = hashlib.sha256(before).hexdigest()
        write_private(release / "rollback.override.yml", override_contents(rollback_image))
        rollback_command = f"cd {ROOT}\ndocker compose --project-name {PROJECT} -f docker-compose.yml -f {release / 'rollback.override.yml'} up -d --no-deps --no-build app\ncp {release / 'rollback.override.yml'} docker-compose.override.yml\n"
        write_private(release / "rollback.sh", "#!/bin/sh\nset -eu\n" + rollback_command)
        os.chmod(release / "rollback.sh", 0o700)
        os.replace(override, ROOT / "docker-compose.override.yml")
        override = ROOT / "docker-compose.override.yml"
        switched = True
        compose(override, "up", "-d", "--no-deps", "--no-build", "app")
        wait_ready(APP)
        check_routes(APP)
        current_db, current_app = inspect(DATABASE), inspect(APP)
        if current_db["Id"] != old_db["Id"] or current_db["Mounts"] != old_db["Mounts"]:
            raise RuntimeError("Database container or volume changed")
        validate_environment(environment(old_app), environment(current_app))
        after_hash = hashlib.sha256(dump_database()).hexdigest()
        result = {"commit": commit, "image": image, "database_container_unchanged": True,
                  "database_contents_unchanged": before_hash == after_hash,
                  "database_sha256_before": before_hash, "database_sha256_after": after_hash,
                  "production_keys_unchanged": True, "schema_unchanged": True,
                  "backup_directory": str(release), "health_checks_passed": True}
        write_private(release / "result.json", json.dumps(result, indent=2))
        if before_hash != after_hash:
            raise RuntimeError("Database changed during cutover; no database restore will be attempted")
        write_private(ROOT / ".deploy" / "production-latest.json", json.dumps(result, indent=2))
        print(json.dumps(result, indent=2), flush=True)
    except Exception:
        if switched:
            print("Validation failed; rolling back the app image only. Database is never restored automatically.", flush=True)
            subprocess.run([str(release / "rollback.sh")], check=True)
            wait_ready(APP)
        raise
    finally:
        subprocess.run(["docker", "rm", "-f", candidate], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        env_file.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    deploy(parser.parse_args().commit)
