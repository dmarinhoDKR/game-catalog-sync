# Game Catalog Sync

Personal learning and portfolio project for a game catalog backend.

[Português](README.pt-BR.md)

## Evidence

### HTTP integration tests

Historical capture: six HTTP tests passed, covering health endpoints and catalog responses
200, 400 and 404. Database scenarios use an isolated PostgreSQL instance.
Lint completed with no warnings or errors.

![Six HTTP tests passing and clean lint output](docs/images/http-tests.png)

### Cursor pagination query plan

[SQL, dataset preparation and observed plan](docs/pagination-explain.md).
On 2026-10-30, a query against 10,000 synthetic games in the isolated test
database used Game_pkey for the cursor condition and ascending ID order,
without a separate Sort. LIMIT stopped execution after 21 rows.
The observed execution recorded four shared-buffer hits and took 0.035 ms.
This single local measurement is not an HTTP benchmark or production latency claim.
The empty-table guard added to the reproduction instructions has not yet been exercised.

## Current status

Implemented and verified locally:

- NestJS and TypeScript using ES modules.
- PostgreSQL 17.11 and Prisma 7.10.0, with four migrations for Game, User, Review and GameSource.
- Review persistence with one review per user/game pair, a database CHECK
  constraint for ratings from 1 to 5, and foreign keys with ON DELETE RESTRICT.
  Tests verify valid ratings, rejected invalid ratings and duplicate reviews,
  nonexistent references, and blocked deletion of referenced users or games.
- GameSource persistence with a composite primary key on provider/externalId,
  a gameId index, contentHash storage and a foreign key with ON DELETE RESTRICT.
  A PostgreSQL test verifies duplicate identity rejection, the same external ID
  across different providers, missing game rejection and blocked game deletion.
- CatalogImportService validates a batch and persists it in one Serializable
  transaction: creates games and sources together, updates changed content,
  and skips matching hashes. Returns created/updated/unchanged/rejected counts.
  A PostgreSQL integration test verifies repeated imports without writes,
  updates preserving IDs, partial batches preserving absent games, mixed valid,
  invalid and duplicate records, and rollback after a simulated application failure.
- Synthetic source validation accepts provider synthetic/version 1 and up to
  1,000 records per batch. Invalid records and duplicate external IDs are counted
  as rejected; the first valid record for each identity is retained.
- Source games reject extra fields and invalid values, trim title/description
  and genres, and deduplicate and sort genres. SHA-256 hashes cover normalized
  title, description and genres, excluding external identity.
- Nine new unit tests cover record normalization and limits, batch validation
  and rejection counts, and stable hashes that change with content.
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
  issuer, audience or algorithm. The guard also protects review writes.
- AdminGuard checks the current database role after JWT authentication.
  HTTP tests on a test-only route cover 401 without authentication or for a
  removed user, 403 for USER, ADMIN access, demotion with the same token,
  and 503 during database failure with recovery afterward.
- API bound explicitly to 127.0.0.1.
- Swagger UI and OpenAPI JSON with an HTTP test of the generated contract.
- GET /games with UUID cursor pagination, ascending id order,
  default limit 20 and maximum 100. Response includes items and nextCursor.
- GET /games/:id: 200 for existing games, 404 for missing games
  and 400 for invalid UUIDs.
- PUT /games/:id/review creates or updates the authenticated user's review
  with HTTP 200, preserving its ID on update. userId comes only from the token;
  the body accepts only integer rating from 1 to 5 and body text trimmed to
  1–2000 UTF-16 code units. HTTP tests confirm rejection of an extra userId,
  independent reviews for two users, 401 for a removed user, 404 for a missing
  game, and 503 during database failure followed by a successful write after recovery.
- DELETE /games/:id/review removes only the authenticated user's review.
  Returns 204 with no body, including repeated deletion or a missing game/review.
  Client-supplied userId in the body or query does not select the owner.
  HTTP tests verify 401 without authentication or for a removed user, 400 for
  an invalid UUID, preservation of another user's review, and 503 during an
  outage followed by successful deletion after recovery with the same app and token.
- Catalog database unavailability: Prisma P1001 returns HTTP 503.
- GET /health/live and GET /health/ready, with failure and recovery
  verified manually.
- 41 unit tests verified on 2026-11-20. The full 25-test e2e suite passed on
  2026-11-18, along with nine MongoDB/PostgreSQL
  archive integration tests. Database scenarios use real
  PostgreSQL in an isolated test database. Coverage includes pagination,
  User and Review constraints, login HTTP responses, rate limiting, token verification,
  rejection of expired or tampered tokens, database failure/recovery,
  and connection closure after app.close().
- Verified build and lint checks.
- Two simultaneous ReviewsService.save calls against real PostgreSQL preserve
  one review and a complete rating/body pair from one input. Separate unit tests
  simulate P2002/P2003 and verify sanitized 409 conflicts.

A first local Redis/BullMQ worker milestone is implemented and demonstrated below.
Administrative sync endpoints, caching, CI and cloud deployment remain unimplemented.
The complete background synchronization acceptance criteria are not yet met.

## Local environment

Rebuilt and verified on 2026-11-14 with Ubuntu 24.04.5 on WSL 2, Node.js 24.16.0
and npm 11.13.0. Docker Desktop 4.98.0, Engine 29.9.2 and Compose 5.6.1
were confirmed during environment setup.

Dependencies are recorded in `package-lock.json`.

## Setup

From the project root:

```bash
npm ci
```

The application requires PostgreSQL, DATABASE_URL and JWT_SECRET.
Compose exposes the development database at 127.0.0.1:5436 and,
through the test profile, the test database at 127.0.0.1:5437.

Development database provisioning is manual and documented below.
Starting Compose alone does not create application roles or schema privileges.

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

### Fresh local environment

Run the following from the project root in Ubuntu/WSL after `npm ci`, with
Docker Desktop running and WSL integration enabled. For an existing setup,
keep its `.env` and database; skip creation steps already completed.

For a new setup, create all variables above without displaying secrets. The
script refuses to overwrite `.env` and uses owner-only file permissions.
It generates hexadecimal passwords so URL encoding is not needed here.
Compose validates the development administrator variable even when only
`db-test` is selected, so include all variables before preparing tests.
```bash
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(32).toString('hex');
const app = secret();
const migration = secret();
const testAdmin = secret();
const testApp = secret();
const values = {
  POSTGRES_ADMIN_PASSWORD: secret(),
  DATABASE_URL: `postgresql://game_catalog_app:${app}@127.0.0.1:5436/game_catalog?schema=catalog`,
  MIGRATION_DATABASE_URL: `postgresql://game_catalog_migrator:${migration}@127.0.0.1:5436/game_catalog?schema=catalog`,
  SHADOW_DATABASE_URL: `postgresql://game_catalog_migrator:${migration}@127.0.0.1:5436/game_catalog_shadow?schema=catalog`,
  JWT_SECRET: secret(),
  DEMO_USER_PASSWORD: secret(),
  DEMO_ADMIN_PASSWORD: secret(),
  POSTGRES_TEST_ADMIN_PASSWORD: testAdmin,
  POSTGRES_TEST_APP_PASSWORD: testApp,
  TEST_DATABASE_URL: `postgresql://game_catalog_test_app:${testApp}@127.0.0.1:5437/game_catalog_test?schema=catalog`,
  TEST_MIGRATION_DATABASE_URL: `postgresql://postgres:${testAdmin}@127.0.0.1:5437/game_catalog_test?schema=catalog`,
};
writeFileSync('.env', Object.entries(values)
  .map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
  { flag: 'wx', mode: 0o600 });
console.log('.env created; secrets not displayed.');
NODE

git check-ignore .env
docker compose --profile test config --quiet
npx --no-install prisma generate --config prisma7.config.ts
```
The expected Git output is `.env`; Compose validation should be silent.
Do not publish `.env` or use `docker compose config` without `--quiet` when
sharing output, since expanded configuration can expose passwords.

### Development database — first initialization only

Use a new development volume. Do not run the provisioning script against an
existing database or repeat it after an error without inspecting its state.
Roles and schema are created in one transaction; shadow creation follows
separately. If shadow creation fails, the preceding transaction remains committed.
Do not remove an existing volume to resolve an initialization error.

The application role receives schema usage and DML privileges, while
`game_catalog_migrator` owns `catalog` and the separate shadow database.
Neither role is a superuser or can create roles or additional databases.
Default privileges apply to objects created by the migration role.
The script requires the 64-character hexadecimal passwords generated above
and sends SQL through standard input without printing them.
```bash
docker compose up -d --wait db

node --input-type=module <<'NODE'
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const app = new URL(process.env.DATABASE_URL);
const migration = new URL(process.env.MIGRATION_DATABASE_URL);
const shadow = new URL(process.env.SHADOW_DATABASE_URL);
for (const url of [app, migration, shadow]) {
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '5436');
  assert.equal(url.searchParams.get('schema'), 'catalog');
}
assert.equal(app.username, 'game_catalog_app');
assert.equal(migration.username, 'game_catalog_migrator');
assert.equal(shadow.username, migration.username);
assert.equal(app.pathname, '/game_catalog');
assert.equal(migration.pathname, '/game_catalog');
assert.equal(shadow.pathname, '/game_catalog_shadow');
assert.equal(shadow.password, migration.password);
const appPassword = decodeURIComponent(app.password);
const migrationPassword = decodeURIComponent(migration.password);
for (const password of [appPassword, migrationPassword]) {
  assert.match(password, /^[a-f0-9]{64}$/);
}
const sql = `
DO $$
BEGIN
  IF current_database() <> 'game_catalog' THEN
    RAISE EXCEPTION 'Unexpected development database';
  END IF;
END $$;
BEGIN;
CREATE ROLE game_catalog_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD '${appPassword}';
CREATE ROLE game_catalog_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD '${migrationPassword}';
CREATE SCHEMA catalog AUTHORIZATION game_catalog_migrator;
GRANT CONNECT ON DATABASE game_catalog
  TO game_catalog_app, game_catalog_migrator;
GRANT USAGE ON SCHEMA catalog TO game_catalog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE game_catalog_migrator IN SCHEMA catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO game_catalog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE game_catalog_migrator IN SCHEMA catalog
  GRANT USAGE ON SEQUENCES TO game_catalog_app;
COMMIT;
CREATE DATABASE game_catalog_shadow OWNER game_catalog_migrator;
`;
const result = spawnSync('docker', [
  'compose', 'exec', '-T', 'db',
  'psql', '-X', '-U', 'postgres', '-d', 'game_catalog',
  '-v', 'ON_ERROR_STOP=1',
], { input: sql, encoding: 'utf8' });
if (result.error) throw result.error;
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Roles, schema, privileges and shadow database prepared.');
NODE
```
After successful provisioning, apply and check migrations:

```bash
npx --no-install prisma migrate deploy --config prisma7.config.ts
npx --no-install prisma migrate status --config prisma7.config.ts
```

Expect `game_catalog` at `127.0.0.1:5436` and all four migrations applied.
The shadow database was created during reconstruction; its use by
`prisma migrate dev` has not yet been exercised. `migrate deploy` does not use it.

After preparing the development database and applying all four migrations,
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

### API documentation

With the API running, open [Swagger UI](http://127.0.0.1:3000/docs/).
The contract is available as [OpenAPI JSON](http://127.0.0.1:3000/docs-json).
Use the configured PORT in both URLs if it differs from 3000.

The document describes login input and token response, optional pagination,
game and review response schemas, health checks and error statuses.
Review PUT and DELETE declare Bearer JWT authentication. Authorization is not
persisted across page reloads; external schema validation is disabled.
Error responses have descriptions without complete body schemas.

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

Historical reconstruction baseline: the regression on 2026-11-14 passed **24 unit tests in 12 files** and
**25 e2e tests in 15 files**, including GameSource, source parsers/hashes,
the transactional importer, OpenAPI and database failure/recovery scenarios.
Prisma Client generation, build and lint also passed; lint reported no warnings
or errors. All four migrations were applied to fresh test and development databases.
The development seed verified three games and two demonstration users.
Manual calls to /health/live, /health/ready and /games returned HTTP 200;
the catalog returned the three seed games and Swagger UI opened successfully.
These results come from a reconstructed local environment with new synthetic
data, not a restoration of the previous database or a production deployment.

The screenshot above and pagination measurements remain historical evidence.
For targeted parser/hash checks:

```bash
npm test -- src/sync/parse-source-game.spec.ts src/sync/parse-source-batch.spec.ts src/sync/source-game-hash.spec.ts
```
On 2026-11-14, npm audit reported zero vulnerabilities after a non-forced
lockfile update to Nest CLI/schematics 12.0.13 and minimatch 11.0.5.
This is a point-in-time dependency check, not a guarantee of overall security.

The new catalog import integration test passed separately after each scenario
was added; build passed for the service and lint passed after the final test change.
The rollback scenario uses a simulated hash-function failure after the first write,
with actual PostgreSQL state checked after rollback. It does not simulate a database outage.
Run it separately with:

```bash
npm run test:e2e -- test/catalog-import.e2e-spec.ts
```

Run the GameSource test separately with:

```bash
npm run test:e2e -- test/game-source-persistence.e2e-spec.ts
```

The contract test checks pagination, matching game schemas, Bearer requirements
for review writes, review input, an empty DELETE 204 response and health schemas.
It checks the generated document, not every runtime response against that document.
Run it separately with:

```bash
npm run test:e2e -- test/openapi.e2e-spec.ts
```

Failure/recovery tests rebuild only db-test and reapply
all available migrations. E2E setup generates a temporary JWT secret instead of using
the development secret.

## Current structure

- `src/health/`: liveness and database readiness endpoints.
- `src/games/`: lookup by ID, paginated listing and limit validation.
- `src/auth/`: login controller, validation, password hashing, JWT options
  and authentication service, Bearer JWT guard and administrative guard.
- `src/reviews/`: authenticated PUT/DELETE controller, input validation, service and module.
- `src/sync/`: source validation/hashing, transactional importer, SyncModule, job
  validation/dispatch, Redis connection options and standalone worker entry point.
- `config/redis-queue.conf` and `compose.queue.yaml`: local authenticated queue Redis.
- `src/prisma/`: database service, module and unavailability error classifier.
- `src/app.module.ts`: root application module.
- `src/main.ts`: application entry point.
- `src/openapi.ts`: shared Swagger and OpenAPI configuration.
- `prisma/`: schema, migrations, synthetic fixtures and seed.
- `test/`: HTTP and service integration tests and test environment validation.

The starter `GET /` endpoint still returns `Hello World!`.

## Limitations and next stages

The project is intended for local development.
Review creation, update and deletion are integrated into the application
and tested over HTTP with user isolation.
Simultaneous service calls have been tested with PostgreSQL, but the test does
not force database scheduling or guarantee a conflict occurs. Mapping P2002/P2003
to 409 is covered by simulated errors; an actual race producing these errors,
reference deletion during writes, and the HTTP 409 contract remain unverified.
This is not an HTTP concurrency or load test. Unexpected errors are rethrown.
Catalog GET routes and health endpoints remain public. Review PUT and DELETE
require a Bearer token. JwtAuthGuard validates token claims without querying the
database; ReviewsService checks user existence before writing. AdminGuard
checks user existence and current role, but is still used only on a test route.
Administrative failure/recovery testing confirms 503 during the outage and
401 afterward for a removed user; it does not demonstrate a successful
administrative operation after recovery.
Refresh tokens and token revocation are not implemented.
Rate-limit counters are held in memory per process and reset on restart;
they are not shared across instances. Window expiry and isolation between
different client IPs have not yet been tested.

Liveness does not query dependencies; readiness queries PostgreSQL.
Only Prisma P1001 is currently mapped to HTTP 503 in game lookup.
The authentication service also maps the observed P2039/57P01 administrative
connection shutdown to 503. Authentication failure/recovery has been tested
at service level; the login HTTP outage response has not been tested separately.

Development provisioning remains manual. A fresh clone, new credentials, roles,
migrations, seed, API health/catalog and Swagger were verified on 2026-11-14.
The combined setup instructions above document that process; they have not been
rerun verbatim as one end-to-end procedure. Development login was not checked
manually during reconstruction; authentication passed in isolated e2e tests.

The failure/recovery test stops and rebuilds only db-test.
It discards that database's data and must not run concurrently
with other suites sharing the same instance.

Explicit shutdown through app.close() has been verified.
API shutdown through system signals has not been validated. Idle worker shutdown
via Ctrl+C was observed separately in the milestone below.
E2E files run without parallel execution.

The cursor is a UUID used as an exclusive boundary: id > cursor.
A valid UUID does not need to identify an existing game.
Pagination does not preserve a snapshot between requests; duplicate-free
navigation was verified with a stable dataset.

The importer parser limits record count, not input JSON byte size. The source archive
CLI additionally enforces a 1 MiB limit before storage; see the MongoDB section.
Record validation uses UTF-16 text lengths: external IDs are 1-100 lowercase ASCII
letters/digits/hyphens, starting with a letter or digit; titles 1-200, descriptions
1-10,000, and 1-20 genres of 1-50 code units each after trimming.
The catalog-v1 test fixture is separate from the seed; validation does not import it.

The importer is provided/exported by SyncModule and used by service integration
tests, the source archive CLI and the standalone worker. The HTTP AppModule remains
unchanged; no administrative import endpoint is exposed.
Its transaction timeout is 30 seconds, not a throughput guarantee for 1,000 records.
Concurrent imports, serialization retries and rollback from a real database error
have not been tested. The archive integration suite verifies source retention during
a real PostgreSQL outage and successful import after recovery. Importer errors
propagate to the caller.
The service does not link existing seed games by title.

Next stages: isolated Redis integration tests, failure/recovery, retry policy, global
import exclusion and abandoned-run reconciliation; then administrative endpoints
and caching.
Complete error response schemas remain a documentation task.
Search, observability and AWS come later.

## AI assistance

I implemented the original API manually with guidance and review suggestions from
Codex. I developed the MongoDB archive with Codex assistance: Codex generated the
implementation under my direction and ran its automated checks. I performed the
manual demonstration and reviewed the
implementation as the project author. The MongoDB section records the evidence
and scope. My review is not an independent third-party review.

## MongoDB source document archive

A local CLI archives synthetic **whole batches** with provider, first receipt date,
format version and SHA-256. MongoDB stores the source; PostgreSQL retains normalized
catalog/auth/review data. Unique content indexes prevent duplicate archival; period
queries use stable cursor pagination. Existing documents can be retrieved and replayed
through CatalogImportService without adding HTTP administrative endpoints.

[Setup, variables, commands, indexes, decisions, error semantics and isolated tests](docs/source-documents.md).
Use `npm run test:documents` for the real MongoDB/PostgreSQL tests. MongoDB is optional
for the HTTP API. The archive alone introduces no queue; the optional worker is
described below. No distributed transaction, exactly-once guarantee or production
deployment is introduced. JSONB would reduce operational cost; MongoDB is a deliberate
document-modeling learning exercise. Only synthetic catalog fields are accepted;
never submit provider credentials, tokens or personal data.

Verified on **2026-11-18**: build/lint, **31 unit tests**, **25 existing e2e tests**
and **9 new real MongoDB/PostgreSQL integration tests** passed. The new tests include
rollback without orphan games and source retention across PostgreSQL outage/recovery.
`npm audit` reported zero vulnerabilities at that point. Development Mongo was
prepared and the CLI was exercised manually, as detailed below.
No existing development data were migrated; the demonstration imported synthetic data.
I developed this feature with Codex assistance, including code generation under my
direction, and confirmed completion of my human review on 2026-11-18. My review is not an independent third-party review.
[AI decision record](docs/ai-assistance.md).

Manual demonstration on **2026-11-18**: the CLI stored the synthetic fixture,
recognized repeated storage with the same ID/hash, retrieved the complete payload,
and listed metadata by provider/date range. The first replay returned
`created: 3`; the second returned `unchanged: 3`, with no creations or updates.
A read-only SQL query confirmed three `synthetic` GameSource records linked to
three games, with their normalized content hashes. This verifies sequential replay
for this fixture, not concurrent import safety or cross-database atomicity.

## Background processing — first worker milestone

I implemented this milestone manually with step-by-step guidance from Codex.
On **2026-11-20**, I demonstrated the real local flow:
Redis/BullMQ → standalone worker → archived MongoDB document → PostgreSQL importer.
The `catalog-import` queue uses prefix `catalog-sync`; a `reprocess-source` job
contains only `{ documentId }`, validated before archive access. No source payload
or credentials are copied into the job. MongoDB is required for this worker flow,
but remains optional for the existing HTTP API.

Job `1` completed with `created: 0`, `updated: 0`, `unchanged: 3`, `rejected: 0`
for the previously imported synthetic fixture. I retrieved the completed job and
its result from Redis. Ctrl+C stopped the idle worker and returned the terminal
prompt. Shutdown with an active import has not been verified, nor have individual
connection closures been independently observed.

### Local Redis and worker

Queue Redis is separate from the future cache and from the PostgreSQL/Mongo Compose
projects. `compose.queue.yaml` pins Redis 7.4.12, publishes only `127.0.0.1:6380`
and mounts `config/redis-queue.conf`, a persistent `/data` volume and a read-only ACL.
The configuration enables AOF with `appendfsync everysec`, a 256 MiB Redis memory
limit and `noeviction`. A crash can lose roughly the latest second of writes;
the Redis memory setting is not a total container RAM limit. At the limit, writes
may fail instead of evicting queue keys.

Local prerequisites (never commit or share their values):

- `REDIS_QUEUE_URL` in the existing `.env`:
  `redis://catalog_queue:<64-lowercase-hex-password>@127.0.0.1:6380/0`.
- `.secrets/redis-queue.acl`, ignored by Git, containing the SHA-256 password hash,
  with the default user disabled and access restricted to `catalog-sync:*` keys
  and channels. The prepared ACL denies administrative/dangerous command categories
  and explicitly permits INFO and client naming/metadata commands needed here.
- The manually prepared directory is mode 0700 and the ACL file 0444 for container
  readability; its contents are protected on the host by the parent directory.
- Existing development PostgreSQL/MongoDB variables and setup described above.

Credential/ACL creation has been performed manually; there is not yet an automated
bootstrap command for this queue setup. Do not start it with a missing ACL file or
regenerate credentials over an existing configuration without checking its state.
The Compose service does not yet have a healthcheck; running status alone is not
readiness. I verified unauthenticated rejection, authenticated PING, prefix isolation,
administrative command denial and synthetic BullMQ queue/worker operations.

With those prerequisites prepared:

```bash
docker compose -f compose.queue.yaml config --quiet
docker compose -f compose.queue.yaml up -d
docker compose up -d --wait db
docker compose -f compose.sources.yaml --profile sources up -d --wait mongo
npm run build
node dist/sync/worker-main.js
```

Starting the worker can consume pending jobs from the development queue and write
to development PostgreSQL. It is intentionally restricted to local development
connections and refuses `NODE_ENV=production`. It starts a Nest application context
using SyncModule, without starting the HTTP API. The producer demonstration used a
terminal script, not a checked-in enqueue command or HTTP endpoint. It set one
attempt and retained up to 100 completed/failed jobs; these are demonstration
submission options, not enforced global queue defaults.

Producer and worker use separate ioredis instances. The producer disables the offline
queue and automatic resend of unfulfilled commands, with a command timeout; the worker
allows reconnection and has no general command timeout for blocking operations.
A producer timeout can still leave the enqueue outcome unknown. Runtime outage and
reconnection behavior of these settings has not yet been verified.

Stop the worker with Ctrl+C before stopping its dependencies. Queue Redis can be
stopped without deleting its persistent volume:

```bash
docker compose -f compose.queue.yaml stop redis-queue
```

### Verification and dependency correction

I ran **41 unit tests in 16 files**, build and lint successfully on 2026-11-20;
lint reported zero warnings/errors. The importer PostgreSQL integration test also
passed through SyncModule. The ten new unit tests cover Redis options (four), job
validation (three) and dispatch/error propagation (three). Dispatch tests use mocks;
they do not replace real queue/database integration tests. The 25-test e2e regression
and nine archive integration tests remain earlier evidence, not a full rerun of
those suites for this milestone.

Prisma 7.10.0 pins a vulnerable Effect dependency. I added an override scoped to
`@prisma/config@7.10.0` for `effect: 3.22.1`, preserving the existing overrides and
Prisma version. Client generation, test database migration preparation, build, lint,
unit tests and the importer integration test passed with the replacement. This
replaces the upstream-pinned dependency and should be revisited when Prisma supplies
a compatible corrected version. `npm audit` reported zero vulnerabilities at this
point; that is a point-in-time dependency check, not an overall security guarantee.

This is not the completed background synchronization feature. Pending work includes
automated tests against isolated Redis, failure/reconnection scenarios, transient vs
permanent error classification, retry/backoff policy, global exclusion and persistent
run tracking/reconciliation. `concurrency: 1` limits only one worker instance.
There is no exactly-once or cross-database atomicity guarantee. Replaying an older
archived batch can overwrite newer content. HTTP administrative endpoints, cache,
load testing and production deployment are outside this verified milestone.
