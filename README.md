# Partnership App (Docker + Better Auth + Prisma)

This project now includes:
- Dockerized Next.js app + MySQL database
- ORM database layer using Prisma
- Better Auth login
- Territory tree selection UI
- Partner-pair slot assignment based on each territory's `no_of_partners`

## Data Model

Prisma creates these core tables:
- `users` (with `username`, `name`, `email`)
- `users.role` controls ordinary user vs `super_admin` access
- `accounts`, `sessions`, `verifications` (Better Auth)
- `areas`
- `territories` (`territory_name`, `area_id`, `locations`, `no_of_partners`, `with_cars`)
- `partner_assignments`

Your provided DTAQ + Street Witnessing territories are seeded from the local JSON file referenced by `SEED_AREAS_JSON_FILE` in `.env.seed.local` (idempotent upserts).

## Local Setup (without Docker)

1. Install dependencies
```bash
npm install
```

2. Configure env
```bash
cp .env.example .env
cp .env.seed.example .env.seed.local
```
Fill `.env.seed.local` with local seed user identities, passwords, and the territory seed JSON filename before running `db:seed`.

3. Push schema and seed
```bash
npm run db:push
npm run db:seed
```

4. Start app
```bash
npm run dev
```

## Docker Setup

1. Build the app and start the database
```bash
docker compose build app
docker compose up -d --wait db
```

For a **new database only**, initialize the schema and seed records explicitly:
```bash
docker compose run --rm --no-deps app sh -c 'npm run db:push && npm run db:seed'
```

Then start the application:
```bash
docker compose up -d --no-deps app
```

For application updates against an existing database, rebuild and replace only the
app service. Do not run database initialization or seeding:
```bash
docker compose build app
docker compose up -d --no-deps app
```

For Docker builds, `NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY` must be available to Docker Compose before the image is built because Next.js bakes `NEXT_PUBLIC_*` values into the browser bundle. Put it in a root `.env` file or export it in the shell before `docker compose build app`. It must match `TERRITORY_TRANSPORT_KEY`.

2. App will be available at:
- [http://localhost:3101](http://localhost:3101)

The app container starts Next.js only. Schema synchronization and seeding are
explicit setup operations; application restarts and image updates do not run them.
The runtime image includes the Prisma client generated in the builder stage.

## Hybrid Dev Mode (Backend in Docker, Frontend Local)

Use this mode when you want database/backend infra in Docker but run frontend development locally with hot reload.

1. Start backend infra and initialize DB schema/data
```bash
npm run hybrid:prepare
```

2. Run frontend locally
```bash
npm run dev:hybrid
```

Frontend URL:
- `http://localhost:3101` (default)
- Override port if needed: `PORT=3000 npm run dev:hybrid`

3. Stop backend infra when done
```bash
npm run backend:down
```

Notes:
- `dev:hybrid` keeps `BETTER_AUTH_URL` and `NEXT_PUBLIC_BETTER_AUTH_URL` aligned to the same local dev port.
- `DATABASE_URL` should continue using `localhost:3306` (already set in `.env.example`).
- If login returns 500, run `npm run hybrid:prepare` again to ensure tables exist and seed users are present.
- Seeded login identities and passwords are read from `.env.seed.local`, which is ignored by git.
- Territory master data is read from the ignored JSON file named by `SEED_AREAS_JSON_FILE`.
- Copy `.env.seed.example` to `.env.seed.local` and set:
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_USERNAME`
  - `DEFAULT_ADMIN_NAME`
  - `DEFAULT_ADMIN_PASSWORD`
  - `DEFAULT_DTAQ_EMAIL`
  - `DEFAULT_DTAQ_USERNAME`
  - `DEFAULT_DTAQ_NAME`
  - `DEFAULT_DTAQ_PASSWORD`
  - `SEED_USER_EMAIL`
  - `SEED_USER_USERNAME`
  - `SEED_USER_NAME`
  - `SEED_USER_PASSWORD`
  - `SUPER_ADMIN_EMAIL` (defaults to `superadmin@email.local.com`)
  - `SUPER_ADMIN_USERNAME` (defaults to `superadmin`)
  - `SUPER_ADMIN_NAME` (defaults to `Super Admin`)
  - `SUPER_ADMIN_PASSWORD` (defaults to the local super admin password)
  - `SEED_AREAS_JSON_FILE` (defaults locally to `seed-territories.local.json`)
  - `PASSWORD_HASH_ENCRYPTION_KEY` (required to encrypt stored password hashes)

## Territory Seed Data

Territories are no longer stored directly in `prisma/seed.ts`. Keep local territory data in `seed-territories.local.json`, which is ignored by git, and point `.env.seed.local` at it:

```bash
SEED_AREAS_JSON_FILE=seed-territories.local.json
```

Start from the committed example file:

```bash
cp seed-territories.example.json seed-territories.local.json
```

The JSON file must contain an array of areas:

```json
[
  {
    "areaName": "DTAQ 1",
    "description": "DTAQ 1",
    "territories": [
      {
        "territoryName": "A",
        "locations": "Stadium Metro Station",
        "noOfPartners": 1,
        "withCars": false
      }
    ]
  }
]
```

After editing `seed-territories.local.json`, reseed the database:

```bash
npm run db:seed
```

For Docker, run the seed command explicitly when you intend to update master data:

```bash
docker compose run --rm --no-deps app npm run db:seed
```

Rebuilding or restarting the application does not seed or synchronize the database.

Because `seed-territories.local.json` is ignored by git, create or copy it from `seed-territories.example.json` into the project root on each machine before running the Docker build.

## Auth Flow

- `/login`: sign in
- `/`: protected main page with area -> territory tree and assignment panel

## Notes

- Passwords are hashed by Better Auth and the stored password hashes are encrypted in MySQL.
- Sessions expire after 1 day.
- Keep `PASSWORD_HASH_ENCRYPTION_KEY` stable. If it is lost or changed, existing encrypted password hashes cannot be verified and users must reset passwords or be reseeded.
- Seed user identities and passwords are local configuration and should not be committed.
- The `users` table contains identity fields (`username`, `name`, `email`).
- Re-running `npm run db:seed` updates area/territory master data from `SEED_AREAS_JSON_FILE` without clearing existing partner assignments.

## Responsive workspaces

After login, super admins open `/admin`; ordinary users open `/workspace`.
Admin pages include `/admin/users`, `/admin/areas`, and `/admin/territories`.
Each page and mutation checks the user's database role on the server.
The assignment workspace shows three columns from 768px upward and three tabs
below 768px. Navigation collapses into a drawer below 1280px.
Appearance offers System, Light, and Dark; System follows live operating-system
changes. Existing saved Light/Dark preferences are retained.

## Browser regression checks

The Playwright suite uses an existing local app server and disposable fixtures.
Never point fixture setup at the application database. The fixture script refuses
any database except a local database named `partnership_ui_check`.

```sh
npm install
npx playwright install chromium
docker run --detach --rm --name partnership-ui-check-db \
  -e MYSQL_ROOT_PASSWORD=ui_test_password \
  -e MYSQL_DATABASE=partnership_ui_check \
  -p 127.0.0.1:3317:3306 mysql:8.4
```

Once MySQL is ready, use a dedicated terminal with these test-only values:

```sh
export DATABASE_URL='mysql://root:ui_test_password@127.0.0.1:3317/partnership_ui_check'
export PASSWORD_HASH_ENCRYPTION_KEY='ui-check-password-key-isolated'
export BETTER_AUTH_SECRET='ui-check-better-auth-secret-only-for-isolated-test'
export BETTER_AUTH_URL='http://localhost:3108'
export NEXT_PUBLIC_BETTER_AUTH_URL='http://localhost:3108'
export TERRITORY_TRANSPORT_KEY='ui-check-transport-key-isolated'
export NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY='ui-check-transport-key-isolated'
npx prisma db push
npx tsx tests/seed-ui-check.ts
npm run dev -- -p 3108
```

In another terminal, run `npm run test:e2e`. Set `E2E_BASE_URL` when using another
local test-server address. Reset fixtures before each complete suite run.
Stop the dedicated server and run `docker stop partnership-ui-check-db` afterward.
The disposable container is removed automatically; no production data is used.

## Production deployment

Public application: [Partnership](https://partnership-app-senjamirv.as2.pitunnel.com).
The tunnel uses the DNS-compatible name `partnership-app`; PiTunnel terminates
HTTPS, and the application still requires its existing login accounts.

`production` is the deployment branch. The Jenkins job `Partnership-App-production`
loads this branch's `Jenkinsfile` and polls only that branch every two minutes.
The previous `Partnership-App-develop` deployment job is disabled.
Push reviewed changes to `production` to deploy; the job's build history records
the exact commit. Its initial build establishes the SCM polling baseline.

Jenkins uses the existing SSH key through a restricted server-side command. The
wrapper in `scripts/jenkins-deploy.sh` accepts only a production commit or a status
request, verifies the remote branch, and refuses to overwrite tracked local edits.
The installed wrapper is `/home/sen/.local/libexec/partnership-production`.
`deploy/jenkins-production.groovy` is the persistent Jenkins job configuration;
it is installed as the Partnership init script on the controller.

`scripts/deploy-production.py` builds a uniquely tagged image and validates a
private candidate container before replacing only `partnerships-app`. It never
starts/recreates the database or runs schema synchronization or seeding. It rejects
schema changes and changes to existing database, authentication-secret, and
encryption-key settings; handle a required migration as a separate reviewed task.
Public authentication URLs can change without rotating those keys.

Each deployment keeps a consistent database backup, runtime-configuration backups,
and an app-only rollback script in `.deploy/production/`. The latest successful
result is `.deploy/production-latest.json`. If validation fails, rollback replaces
the app image and never restores the database automatically. Backups, local runtime
overrides, and deployment state are excluded from Git and Docker build contexts.

Run deployment guard checks with:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## First-login tutorials and local preview

First-login tutorials are disabled unless the server receives
`ENABLE_ONBOARDING_TUTORIAL=true`. This runtime flag controls both the tutorials
and sign-in reminder markers. No database migration is required.

Admins receive an explanatory overview tour. The assignment workspace tour is
hands-on: it uses the signed-in account's real workspace records and waits for a
complete pair and saved state. Skipping or going back does not undo edits. The
question-mark button in the header replays the current workspace's tutorial.
Completion and interrupted progress are stored per account and tour in browser
storage, under `partnership:tutorial:v1:` keys. The “Don't show this tutorial again.”
checkbox is checked by default and can be changed on the welcome dialog or any
step without closing the current tutorial. With it unchecked, skipping dismisses
the tutorial until the next successful sign-in, including across reloads. Completed
tutorials remain dismissed; Replay always works and keeps the saved preference.
Existing completed/skipped records remain dismissed. Checkbox preferences and
non-sensitive sign-in markers are stored separately from tutorial progress.
Without storage, these settings last for the current document's client-side
navigation only; they cannot survive a full reload.

Run the dedicated tutorial browser tests against an enabled, isolated preview:

```sh
E2E_TUTORIALS=true E2E_BASE_URL=http://localhost:3110 npx playwright test tests/tutorial.spec.ts
```

The tutorial tests expect the disposable fixtures from `tests/seed-ui-check.ts`
and matching transport-key environment variables in the test runner and preview.
Run the existing `tests/workspace.spec.ts` regression suite against a preview
with tutorials disabled. Never seed or run browser fixtures against production.
