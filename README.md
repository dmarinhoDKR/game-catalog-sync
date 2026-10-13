# Game Catalog Sync

Personal learning and portfolio project for a game catalog backend.

[Português](README.pt-BR.md)

## Current status

Implemented and verified locally:

- NestJS and TypeScript using ES modules.
- PostgreSQL 17.11 and Prisma 7.10.0, with an initial migration.
- Separate application and migration database users.
- A repeatable seed with three synthetic games.
- GET /games/:id: 200 for existing games, 404 for missing games
  and 400 for invalid UUIDs.
- Catalog database unavailability: Prisma P1001 returns HTTP 503.
- GET /health/live and GET /health/ready, with failure and recovery
  verified manually.
- One unit test and three HTTP tests using Vitest; readiness uses
  real PostgreSQL in an isolated test database.
- Verified build and lint checks.

Pagination, authentication, reviews, Redis, background synchronization,
CI and cloud deployment are not implemented yet.
Automated catalog HTTP tests are still pending.

## Local environment

Verified with Ubuntu 24.04.4 on WSL, Node.js 24.16.0 and npm 11.13.0.

Dependencies are recorded in `package-lock.json`.

## Setup

From the project root:

```bash
npm ci
```

The application requires PostgreSQL and DATABASE_URL.
Compose exposes the development database at 127.0.0.1:5436 and,
through the test profile, the test database at 127.0.0.1:5437.

Database users, schema and permissions currently require manual setup.
Starting Compose alone does not complete setup.
Full preparation instructions are still pending.

Local variables:

- POSTGRES_ADMIN_PASSWORD: development database administrator password.
- DATABASE_URL: application connection using the limited user.
- MIGRATION_DATABASE_URL: migration user connection.
- SHADOW_DATABASE_URL: separate shadow database connection.
- POSTGRES_TEST_ADMIN_PASSWORD: test database administrator password.
- TEST_DATABASE_URL: limited test user connection.
- TEST_MIGRATION_DATABASE_URL: administrator connection for test migrations.

Credentials belong in .env, which is ignored by Git.
Never use the same URL for the main and shadow databases.

The generated client is also ignored by Git. Generate it after npm ci:

```bash
npx --no-install prisma generate
```

The API defaults to port 3000; PORT can override it.
Check that the port is available:

```bash
ss -ltn 'sport = :3000'
```

After preparing and starting the database, start the API:

```bash
npm run start:dev
```

With the API running, execute in another terminal:

```bash
curl -i http://localhost:3000/health/live
curl -i http://localhost:3000/health/ready
```

With the database available, both return HTTP 200 and {"status":"ok"}.
If the database query fails, readiness returns 503;
liveness remains independent of that query.

Stop the API with Ctrl+C.

## Verification

```bash
npm test
npm run test:e2e
npm run build
npm run lint
```

E2E tests require a prepared and running db-test service.
It uses tmpfs: data, users and permissions must be recreated after
stopping the container. Preparation is currently manual.

## Current structure

- `src/health/`: liveness and database readiness endpoints.
- `src/games/`: game lookup by ID.
- `src/prisma/`: database service and module.
- `src/app.module.ts`: root application module.
- `src/main.ts`: application entry point.
- `prisma/`: schema, migrations, fixture and seed.
- `test/`: HTTP integration tests and test environment validation.

The starter `GET /` endpoint still returns `Hello World!`.

## Limitations and next stages

The project is intended for local development.
Authentication and authorization are not implemented yet.

Liveness does not query dependencies; readiness queries PostgreSQL.
Only Prisma P1001 is currently mapped to HTTP 503 in game lookup.

Database preparation is manual, and a fresh-clone setup has not been
fully documented or verified. Automated catalog HTTP tests and
automated failure/recovery tests are still pending.

Next stages: catalog tests, pagination, authentication and reviews,
followed by background synchronization and caching.
Search, observability and AWS come later.

## AI assistance

I implemented the project manually with guidance and code review
suggestions from Codex. I reviewed the code and ran the checks described
in this README. AI review is not an independent team review.
