#!/bin/sh
# Forced SSH command: only deploy a reviewed commit from origin/production.
set -efu
DEPLOY_DIR=/home/sen/Partnership-App
cd "$DEPLOY_DIR"

if [ "${SSH_ORIGINAL_COMMAND:-}" = status ]; then
  git branch --show-current
  git rev-parse HEAD
  exit 0
fi

set -- ${SSH_ORIGINAL_COMMAND:-}
[ "$#" -eq 2 ] && [ "$1" = deploy ] || { echo 'Expected: deploy <production commit>'; exit 1; }
commit=$2
[ "${#commit}" -eq 40 ] || exit 1
case "$commit" in *[!0-9a-f]*) exit 1 ;; esac

mkdir -p .deploy
chmod 700 .deploy
exec 9>.deploy/production.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }

git diff --quiet && git diff --cached --quiet || { echo 'Tracked deployment files contain local changes; refusing to overwrite them.'; exit 1; }
git fetch --no-tags origin production
[ "$(git rev-parse origin/production)" = "$commit" ] || { echo 'Production advanced; let the next SCM poll deploy its current head.'; exit 1; }
if git ls-tree -r --name-only "$commit" | grep -Eq '^(\.env$|\.env\.seed\.local$|seed-territories\.local\.json$|docker-compose\.override\.yml$|\.deploy/)'; then
  echo 'Production must not track runtime configuration, backups, or local seed data.'
  exit 1
fi
git switch production
git merge --ff-only "$commit"
[ "$(git rev-parse HEAD)" = "$commit" ] || exit 1
python3 scripts/deploy-production.py --commit "$commit"
