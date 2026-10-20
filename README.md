# Game Catalog Sync

Personal learning and portfolio project for a game catalog backend.

[Português](README.pt-BR.md)

## Evidence

### HTTP integration tests

Historical capture: six HTTP tests passed, covering health endpoints and catalog responses
200, 400 and 404. Database scenarios use an isolated PostgreSQL instance.
Lint completed with no warnings or errors.

![Six HTTP tests passing and clean lint output](docs/images/http-tests.png)

## Current status

Implemented and verified locally:

- NestJS and TypeScript using ES modules.
- PostgreSQL 17.11 and Prisma 7.10.0, with Game and User migrations.
- Separate application and migration database users.
- A repeatable seed with three synthetic games and two demonstration users.
- POST /auth/login with normalized email, scrypt password verification,
  generic 401 errors and an HS256 JWT valid for 15 minutes.
- Login accepts only email and password; responses contain only access_token
  and include Cache-Control: no-store.
- Login rate limit: five requests per minute per IP, with 429 and Retry-After;
  one credential verification at a time per service instance.
- Bearer JWT guard registered and exported by AuthModule. HTTP tests on a
  test-only route accept a valid token and return 401 for missing, malformed,
  expired or tampered tokens, invalid subject or role, and unexpected
  issuer, audience or algorithm. Functional routes do not use the guard yet.
- API bound explicitly to 127.0.0.1.
- GET /games with UUID cursor pagination, ascending id order,
  default limit 20 and maximum 100. Response includes items and nextCursor.
- GET /games/:id: 200 for existing games, 404 for missing games
  and 400 for invalid UUIDs.
- Catalog database unavailability: Prisma P1001 returns HTTP 503.
- GET /health/live and GET /health/ready, with failure and recovery
  verified manually.
- Nine unit tests and seventeen e2e tests, with database scenarios using real
  PostgreSQL in an isolated test database. Coverage includes pagination,
  User constraints, login HTTP responses, rate limiting, token verification,
  rejection of expired or tampered tokens, database failure/recovery,
  and connection closure after app.close().
- Verified build and lint checks.

Guard application to functional routes, role-based authorization, reviews,
Redis, background synchronization,
CI and cloud deployment are not implemented yet.

## Local environment

Verified with Ubuntu 24.04.4 on WSL, Node.js 24.16.0 and npm 11.13.0.

Dependencies are recorded in `package-lock.json`.

## Setup

From the project root:

```bash
npm ci
```

The application requires PostgreSQL, DATABASE_URL and JWT_SECRET.
Compose exposes the development database at 127.0.0.1:5436 and,
through the test profile, the test database at 127.0.0.1:5437.

Development database users, schema and permissions still require manual
setup. Starting Compose alone does not complete this setup.
Full preparation instructions are still pending.

The test database has automated preparation, described in Verification.

Local variables:

- POSTGRES_ADMIN_PASSWORD: development database administrator password.
- DATABASE_URL: application connection using the limited user.
- MIGRATION_DATABASE_URL: migration user connection.
- SHADOW_DATABASE_URL: separate shadow database connection.
- JWT_SECRET: 64 lowercase hexadecimal characters generated from 32 random
  bytes; required at application startup, with no fallback value.
- DEMO_USER_PASSWORD: synthetic password for user@example.test (seed only).
- DEMO_ADMIN_PASSWORD: different synthetic password for admin@example.test
  (seed only). Each seed password requires at least 15 characters and at most
  1024 UTF-8 bytes. Do not use personal credentials.
- POSTGRES_TEST_ADMIN_PASSWORD: test database administrator password.
- TEST_DATABASE_URL: limited test user connection.
- TEST_MIGRATION_DATABASE_URL: administrator connection for test migrations.
- POSTGRES_TEST_APP_PASSWORD: raw limited test user password;
  it must match the password in TEST_DATABASE_URL before URL encoding.

Credentials belong in .env, which is ignored by Git.
Never use the same URL for the main and shadow databases.

The generated client is also ignored by Git. Generate it after npm ci:

```bash
npx --no-install prisma generate
```

After preparing the development database and applying both migrations,
configure the demonstration passwords and run:

```bash
npm run build
node prisma/seed.mjs
```

The seed checks the application database identity and creates
user@example.test (USER) and admin@example.test (ADMIN) with scrypt hashes.
Repeated runs preserve existing games, passwords and roles. Changing a seed
password in .env does not rotate stored credentials; verification fails if
the configured password or expected role differs from the stored record.

The API listens on 127.0.0.1, port 3000 by default; PORT can override the port.
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

With the test variables configured in .env, run:

```bash
npm run test:db:prepare
npm test
npm run test:e2e
npm run build
npm run lint
```

Preparation starts only db-test, creates the limited user, schema and
permissions when initializing an empty database, and applies migrations.

db-test uses tmpfs and loses its data when stopped. Run
npm run test:db:prepare before testing after each stop.

The latest e2e regression passed seventeen tests across seven files;
build and lint also passed for the guard changes. The nine unit tests passed
at the previous login milestone and were not rerun for this change.
Failure/recovery tests rebuild only db-test and reapply
both migrations. E2E setup generates a temporary JWT secret instead of using
the development secret.

## Current structure

- `src/health/`: liveness and database readiness endpoints.
- `src/games/`: lookup by ID, paginated listing and limit validation.
- `src/auth/`: login controller, validation, password hashing, JWT options
  and authentication service, and Bearer JWT guard.
- `src/prisma/`: database service and module.
- `src/app.module.ts`: root application module.
- `src/main.ts`: application entry point.
- `prisma/`: schema, migrations, synthetic fixtures and seed.
- `test/`: HTTP and service integration tests and test environment validation.

The starter `GET /` endpoint still returns `Hello World!`.

## Limitations and next stages

The project is intended for local development.
Login issues tokens, and the Bearer guard is available and tested on a
test-only route. Functional routes remain public and do not enforce
USER/ADMIN authorization. The guard validates token claims without checking
whether the user still exists or their role has changed in the database.
Refresh tokens and token revocation are not implemented.
Rate-limit counters are held in memory per process and reset on restart;
they are not shared across instances. Window expiry and isolation between
different client IPs have not yet been tested.

Liveness does not query dependencies; readiness queries PostgreSQL.
Only Prisma P1001 is currently mapped to HTTP 503 in game lookup.
The authentication service also maps the observed P2039/57P01 administrative
connection shutdown to 503. Authentication failure/recovery has been tested
at service level; the login HTTP outage response has not been tested separately.

Development database preparation is still manual, and a fresh-clone setup has not been
fully documented or verified.

The failure/recovery test stops and rebuilds only db-test.
It discards that database's data and must not run concurrently
with other suites sharing the same instance.

Explicit shutdown through app.close() has been verified.
Shutdown through system signals, such as Ctrl+C, has not been validated.
E2E files run without parallel execution.

The cursor is a UUID used as an exclusive boundary: id > cursor.
A valid UUID does not need to identify an existing game.
Pagination does not preserve a snapshot between requests; duplicate-free
navigation was verified with a stable dataset.

Next stages: token-based route protection, role-based authorization and reviews,
followed by background synchronization and caching.
Search, observability and AWS come later.

## AI assistance

I implemented the project manually with guidance and code review
suggestions from Codex. I reviewed the code and ran the checks described
in this README. AI review is not an independent team review.
