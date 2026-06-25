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

1. Build and run containers
```bash
docker compose up --build
```

2. App will be available at:
- [http://localhost:3000](http://localhost:3000)

The app container runs:
- `prisma db push`
- `npm run db:seed`
- `next start`

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

For Docker, rebuild or restart the container flow that runs the seed step:

```bash
docker compose up -d --build
```

Because `seed-territories.local.json` is ignored by git, create or copy it from `seed-territories.example.json` into the project root on each machine before running the Docker build.

## Auth Flow

- `/login`: sign in
- `/`: protected main page with area -> territory tree and assignment panel

## Notes

- Passwords are securely handled by Better Auth in the `accounts` table.
- Seed user identities and passwords are local configuration and should not be committed.
- The `users` table contains identity fields (`username`, `name`, `email`).
- Re-running `npm run db:seed` updates area/territory master data from `SEED_AREAS_JSON_FILE` without clearing existing partner assignments.
