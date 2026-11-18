# Source document archive (MongoDB)

## Decision and boundary

This local feature archives a **whole synthetic catalog batch**, matching
`CatalogImportService.importBatch` and its PostgreSQL transaction. PostgreSQL remains
authoritative for Game, GameSource, User and Review; their schema is unchanged.
MongoDB is not a second catalog and is not required by the HTTP API.

PostgreSQL/JSONB could implement this feature with fewer services and one database
transaction. MongoDB was chosen deliberately to practice document modeling, indexes
and replay. Its costs are an extra server/driver, credentials, backups and independent
failure modes. No queue, microservice, outbox or distributed transaction is introduced.
The official `mongodb` driver is sufficient; no Mongoose or Jest was added.

## Document and indexes

Collection `source_batches`:

- `_id`: ObjectId; CLI uses its 24 lowercase hexadecimal representation.
- `provider`: `synthetic` only in this version.
- `receivedAt`: application UTC timestamp at first successful storage.
- `formatVersion`: `1`, taken from the batch's `version`.
- `contentHash`: lowercase SHA-256 of the canonical JSON payload.
- `payload`: `{ provider, version, games }`, before importer normalization.

Object keys are sorted recursively for hashing. Array order, duplicate records,
invalid records, and whitespace inside strings remain significant. JSON formatting
and key order do not affect identity; this is not byte-for-byte file archival.
Changing a title's surrounding spaces creates a new archived batch even if importer
normalization later considers its games unchanged. The source hash and normalized
per-game PostgreSQL hash therefore serve different purposes.

Indexes are created on connection:

1. `unique_source_content`: unique `(provider, formatVersion, contentHash)`.
2. `provider_received_id`: `(provider, receivedAt, _id)` ascending.

A duplicate receipt returns the existing ID and first receipt date; it does not add
an event or change timestamps. The unique index handles concurrent duplicate inserts.
SHA-256 collision resistance is assumed; no separate byte comparison is performed.
A MongoDB JSON Schema validator constrains metadata types and top-level fields.
The application validates payload contents before storage and revalidates payload/hash
before retrieval or import. Existing collections are not automatically migrated.

## Validation and data policy

- Input file and canonical JSON: at most **1 MiB UTF-8**, below MongoDB's 16 MiB
  BSON document limit. At most 1,000 records, provider `synthetic`, version `1`.
- Batch envelope fields: exactly those accepted by the existing parser; no extras.
- Records: objects containing only `externalId`, `title`, `description`, `genres`,
  or `null`. Non-genre values must be strings up to 20,000 UTF-16 code units;
  genres must be up to 20 strings, each up to 100 code units. Missing fields and
  safe business-invalid values are retained for the importer's rejection counts.
  Other shapes/fields are rejected before storage, not silently stripped.
- The existing importer applies its stricter game validation, normalization and
  first-valid-external-ID behavior. A structurally accepted document may yield only
  rejected records; it is still available for inspection/replay.
- Never submit real credentials, tokens, HTTP headers or personal/provider account
  metadata. This version accepts **trusted synthetic catalog text only**. Allowlists
  block extra fields but cannot prove that a title/description contains no personal
  information or embedded secret. This is not a general-purpose untrusted API collector.
- No user-supplied Mongo filters/operators, collection names or sort expressions.
  Queries accept scalar provider, strict ISO UTC dates, a bounded limit and cursor.

## Local preparation (Ubuntu/WSL)

Requires the existing Node environment and `npm ci`. MongoDB image is pinned to
`mongo:8.0.16`; the Node driver is pinned in the lockfile. Docker Desktop must be
running with WSL integration. Build and generate Prisma as in the main README.

For a **new** Mongo configuration, with the existing PostgreSQL `.env` present:

```bash
npm run documents:configure
```

This appends random hexadecimal passwords and a URI to `.env`, preserves existing
PostgreSQL values, applies mode 0600 and refuses if any Mongo variable already exists.
Do not rerun it to rotate credentials for an existing volume. Variables (no secret values):

- `MONGO_ROOT_PASSWORD`: bootstrap administrator password for the Mongo container.
- `MONGO_APP_PASSWORD`: password for `source_archive_app`.
- `MONGODB_URI`: `mongodb://source_archive_app:<password>@127.0.0.1:27018/game_catalog_sources?authSource=game_catalog_sources`.

```bash
docker compose -f compose.sources.yaml --profile sources config --quiet
docker compose -f compose.sources.yaml --profile sources up -d --wait mongo
npm run build
```

The separate Compose project `game-catalog-sources` binds Mongo only to
`127.0.0.1:27018`, uses authentication and a persistent `source_documents` volume.
Both Mongo Compose files currently use the project name `game-catalog-sources`:
a development `up` can report the stopped test container as an orphan. This warning
was observed during the manual demonstration. Do not use `--remove-orphans` or
`down -v` to resolve it; the services use distinct ports and storage. Separating
the Compose project names is a possible follow-up, not part of this documentation edit.

Initialization creates an application `readWrite` user scoped to `game_catalog_sources`,
not an administrator. Initialization runs only on a new volume. Runtime URI validation
accepts only that local host/port/database/user/authSource. Remote and production
configuration is intentionally unsupported; the CLI refuses `NODE_ENV=production`.
This is local isolation, not a production hardening or TLS deployment guide.
Mongo operations have connection/selection/socket/operation timeouts and a small pool.
Writes request acknowledgement and journaling on this standalone server; there is no
replica-set availability guarantee. Index/schema initialization requires the scoped
readWrite role, which also has collection-management privileges; it is not immutable
storage against a malicious database operator.

## Reproducible synthetic flow

The commands run from the project root. `store`, `list` and `get` do not need
PostgreSQL. `reprocess` requires the already prepared development PostgreSQL database.
**Reprocessing writes to local development** and may create/update games; use tests
below for an isolated demonstration instead. It does not associate seed games by title.

```bash
npm run documents -- store test/fixtures/catalog-v1.json
# Copy the returned id (not a literal placeholder):
npm run documents -- get <id>
npm run documents -- list synthetic 2026-01-01T00:00:00.000Z 2027-01-01T00:00:00.000Z 20
npm run documents -- reprocess <id>
npm run documents -- reprocess <id>
npm run documents -- store test/fixtures/catalog-v1.json
```

Replace `<id>` with the returned ObjectId; do not type angle brackets in a shell.
First import creates three games/sources if those external IDs do not already exist.
A sequential repetition with unchanged content returns `unchanged: 3`; storing the
same fixture again returns `duplicate: true` and the same archive ID.
List returns metadata only and an optional `nextCursor`. To continue, repeat exactly
the same provider/from/to and append the cursor after the limit:

```text
npm run documents -- list synthetic FROM_ISO TO_ISO 20 CURSOR
```

Dates must be explicit UTC with milliseconds, e.g. `2026-11-18T00:00:00.000Z`.
The period is `[from, to)`; order is `(receivedAt, _id)` ascending. Limit defaults to
20 and is bounded to 1–100. The cursor is validated and bound to the filter, but is
not signed or an authorization token. It is a keyset boundary, not a snapshot;
concurrent insertion or clock changes do not provide snapshot-consistent traversal.

CLI errors expose fixed codes, not driver/SQL messages, payloads, URIs or stack traces.
Examples: `INVALID_BATCH`, `DOCUMENT_TOO_LARGE`, `INVALID_CURSOR`,
`DOCUMENT_NOT_FOUND`, `ARCHIVE_UNAVAILABLE`, `IMPORT_FAILED_DOCUMENT_RETAINED`.
`get` deliberately prints the archived payload; use only the allowed synthetic data.

## Failure semantics and replay limits

1. `store` writes only MongoDB. Failure before acknowledgement is reported as
   `ARCHIVE_WRITE_FAILED_RETRY_SAFE`. Its outcome may be unknown; retrying the same
   batch uses the unique index and retrieves any already committed document.
2. `reprocess` retrieves and validates an existing Mongo document, then calls the
   existing PostgreSQL importer. Mongo is never deleted or updated by reprocessing.
3. PostgreSQL failure/rollback leaves the source available for another attempt.
   If the process dies after PG commit but before returning a result, the caller
   cannot know the result from an archive status; sequential replay rechecks hashes.

There is **no atomicity across MongoDB and PostgreSQL** and no durable import-attempt
log/status. There are no automatic retries or reconciliation workers. Mongo failure
prevents fetching a source; PostgreSQL is not called in that case.

Existing guarantees: sequential same-content replay skips matching game hashes;
changed content updates by `(provider, externalId)`; partial batches do not delete
absent games. This does **not** guarantee concurrent imports, exactly-once delivery,
serialization retries, monotonic source versions or ordered replay. Replaying an old
batch after a newer batch can restore old game content. Coordinate local imports
serially; the original Serializable transaction may fail under contention.

## Automated real-database verification

No CI existed in the inspected checkout. The following command automates preparation,
execution and Mongo test shutdown without adding another test framework:

```bash
npm run test:documents
```

The existing PostgreSQL test variables must be configured as in the main README.
The runner validates both PostgreSQL URLs before invoking Docker or migrations:
`127.0.0.1:5437/game_catalog_test`, application `game_catalog_test_app` and migration
user `postgres`, schema `catalog`. It only prepares/stops/recreates `db-test`.
Never run this suite concurrently with other PostgreSQL e2e suites.

`compose.sources-test.yaml` starts only `mongo-test` on `127.0.0.1:27019`, database
`game_catalog_sources_test`, with tmpfs and fresh random credentials per run.
`TEST_MONGODB_URI`, `MONGO_TEST_ROOT_PASSWORD` and `MONGO_TEST_APP_PASSWORD` are
injected by the runner, not copied from development. The driver validates that exact
Mongo test target. Tests verify live PostgreSQL/Mongo identities before scoped cleanup;
only IDs created by the suite are deleted. The last scenario intentionally stops and
reinitializes **the disposable PostgreSQL test database** to verify recovery.
Mongo test data disappear on stop. Development Mongo/PostgreSQL volumes are not touched.
A lock file prevents two instances of this runner; it cannot lock unrelated e2e commands.
An interrupted run may leave `.documents-test.lock`; check no test is running before
removing it manually. Do not use `down -v` to clear test errors.

Checks cover real persistence/retrieval and indexes, direct unique-index rejection,
concurrent archive deduplication, changed batches, period boundaries, timestamp ties,
pagination/cursor rejection, PostgreSQL creation/repetition/update/preservation,
invalid record counts, transaction rollback, retained sources, tamper detection,
sanitized connection errors and actual PostgreSQL outage/recovery.
No automated external API ingestion, cloud deployment, load benchmark or Mongo
replica-set failover is claimed.

For all checks, sequentially:

```bash
npx --no-install prisma generate --config prisma7.config.ts
npm run build
npm run lint
npm test
npm run test:documents
npm run test:e2e
```

Stop development Mongo when done (preserves its volume):

```bash
docker compose -f compose.sources.yaml --profile sources stop mongo
```

## References

- [Official Node driver](https://www.mongodb.com/docs/drivers/node/current/)
- [Unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/)
- [MongoDB limits](https://www.mongodb.com/docs/manual/reference/limits/)
- [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html)

## Verified on 2026-11-18

- Build and lint passed (zero warnings/errors).
- 31 unit tests passed in 13 files, including seven new validation/configuration tests.
- All 25 existing e2e tests passed in 15 files.
- Nine new tests passed against real MongoDB 8.0.16 and PostgreSQL 17.11,
  including a real PostgreSQL outage/recovery and rollback with no orphan games.
- `npm audit` reported zero vulnerabilities at verification time; this is not a security audit.
- Codex checked CLI production-mode refusal. I completed the manual demonstration
  on 2026-11-18: I initialized development MongoDB and used the CLI to store,
  deduplicate, retrieve and list the synthetic batch. Repeated storage
  returned the same document ID/hash. The first replay created three games; the
  second returned three unchanged, with no creations or updates. A read-only
  PostgreSQL query confirmed three source records, linked game IDs and content hashes.
- No Prisma model changes or migration of pre-existing development records. The
  manual replay created three new synthetic game/source pairs; it did not match
  existing seed games by title. No deploy, feature commit or push has been performed.

I confirmed completion of my review as the project author on 2026-11-18. This is
not an independent third-party review. See [AI decision record](ai-assistance.md).
The checks above were run for the implementation; this documentation-only update
does not constitute a new execution of the tests or dependency audit.
