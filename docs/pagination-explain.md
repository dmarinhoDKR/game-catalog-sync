# Cursor pagination query plan

Verified locally on 2026-10-30 with PostgreSQL 17.11.

## Environment

- Isolated database: game_catalog_test, Compose service db-test.
- Query executed as game_catalog_test_app.
- 10,000 synthetic games with sequential UUID suffixes from
  000000000001 to 000000010000, using prefix 10000000-0000-4000-8000-.
- Table statistics refreshed with ANALYZE before measurement.
- Existing index: Game_pkey, a unique B-tree index on id.

## Dataset preparation

Use only the isolated test database. Start it and apply migrations:

```bash
npm run test:db:prepare
```

The following insert expects an empty Game table. Do not run the
integration suites concurrently with this experiment.

```bash
docker compose --profile test exec -T db-test \
  psql -v ON_ERROR_STOP=1 \
  -U game_catalog_test_app -d game_catalog_test <<'SQL'
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'game_catalog_test'
     OR current_user <> 'game_catalog_test_app' THEN
    RAISE EXCEPTION 'Unexpected database or user';
  END IF;

  IF EXISTS (SELECT 1 FROM catalog."Game") THEN
    RAISE EXCEPTION 'Expected an empty Game table';
  END IF;
END;
$$;

INSERT INTO catalog."Game"
  ("id", "title", "description", "genres", "updatedAt")
SELECT
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Synthetic Game ' || n,
  'Synthetic record for pagination analysis.',
  ARRAY['Puzzle']::text[],
  CURRENT_TIMESTAMP
FROM generate_series(1, 10000) AS series(n);

COMMIT;

SELECT COUNT(*) AS games FROM catalog."Game";
SQL
```

Expected count: 10000. Refresh table statistics as the table owner:

```bash
docker compose --profile test exec db-test \
  psql -v ON_ERROR_STOP=1 -U postgres -d game_catalog_test \
  -c 'ANALYZE catalog."Game";'
```

Execute the query below through psql as game_catalog_test_app in
game_catalog_test. The test database uses tmpfs: stopping db-test discards
its data. Run test:db:prepare again after a stop.

## Query

This matches the catalog pagination query with a limit of 20 plus
one extra record to detect the next page.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "title", "description", "genres", "updatedAt"
FROM catalog."Game"
WHERE "id" > '10000000-0000-4000-8000-000000005000'::uuid
ORDER BY "id" ASC
LIMIT 21;
```

## Observed plan

```text
Limit  (cost=0.29..1.41 rows=21 width=118) (actual time=0.013..0.018 rows=21 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using "Game_pkey" on "Game"  (cost=0.29..264.91 rows=4950 width=118) (actual time=0.012..0.015 rows=21 loops=1)
        Index Cond: (id > '10000000-0000-4000-8000-000000005000'::uuid)
        Buffers: shared hit=4
Planning:
  Buffers: shared hit=80
Planning Time: 0.187 ms
Execution Time: 0.035 ms
```

## Interpretation

The primary-key index supports both the exclusive cursor condition
and ascending ID order. No separate Sort node was needed.

The Limit node stopped execution after 21 rows. The estimate of 4,950
rows describes the index scan without that limit.

Execution recorded four shared-buffer hits, meaning those block accesses
were served from PostgreSQL's shared buffer cache.

## Limitations

This is one local execution with synthetic data and cached blocks.
It is not an HTTP benchmark, a load test or evidence of production latency.
No comparison with OFFSET pagination or an alternative index was performed.
Plans and timings may change with data distribution, statistics and hardware.

The development database was not modified.