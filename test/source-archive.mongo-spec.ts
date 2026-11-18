import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { MongoClient, ObjectId } from 'mongodb';
import { vi } from 'vitest';
import { archiveConfig } from '../src/source-documents/archive-config.js';
import { SourceArchive } from '../src/source-documents/source-archive.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CatalogImportService } from '../src/sync/catalog-import.service.js';
import * as hashModule from '../src/sync/source-game-hash.js';

const config = archiveConfig(process.env.TEST_MONGODB_URI, true);
let archive: SourceArchive;
let client: MongoClient;
let prisma: PrismaService;
let postgresVerified = false;
let mongoVerified = false;
const ids: ObjectId[] = [];
const externalIds: string[] = [];
function batch() {
  const externalId = `archive-${randomUUID()}`;
  externalIds.push(externalId);
  return {
    provider: 'synthetic',
    version: '1',
    games: [
      {
        externalId,
        title: 'Synthetic archive game',
        description: 'Synthetic fixture',
        genres: ['Puzzle'],
      },
    ],
  };
}
async function store(input: unknown) {
  const result = await archive.store(JSON.stringify(input));
  ids.push(result.document._id);
  return result;
}
beforeAll(async () => {
  // setup-env.ts validates the PG URL; additionally verify the live identity before cleanup.
  prisma = new PrismaService();
  const [identity] = await prisma.$queryRaw<
    { username: string; database: string }[]
  >`
    SELECT current_user AS username, current_database() AS database`;
  assert.equal(identity.username, 'game_catalog_test_app');
  assert.equal(identity.database, 'game_catalog_test');
  postgresVerified = true;
  archive = await SourceArchive.connect(config);
  client = await new MongoClient(config.uri).connect();
  const identityMongo = await client
    .db(config.database)
    .command({ connectionStatus: 1 });
  expect(identityMongo.authInfo.authenticatedUsers).toContainEqual({
    user: 'source_archive_test_app',
    db: config.database,
  });
  mongoVerified = true;
});
afterAll(async () => {
  if (client) {
    if (mongoVerified)
      await client
        .db(config.database)
        .collection('source_batches')
        .deleteMany({ _id: { $in: ids } });
    await client.close();
  }
  if (prisma && postgresVerified) {
    const scope = { provider: 'synthetic', externalId: { in: externalIds } };
    const sources = await prisma.gameSource.findMany({ where: scope });
    await prisma.gameSource.deleteMany({ where: scope });
    await prisma.game.deleteMany({
      where: { id: { in: sources.map((v) => v.gameId) } },
    });
  }
  if (prisma) await prisma.$disconnect();
  if (archive) await archive.close();
});

it('stores and retrieves exact batch data, metadata, dates and server-side unique indexes', async () => {
  const input = batch();
  const result = await store(input);
  expect(result.duplicate).toBe(false);
  const found = await archive.get(result.document._id.toHexString());
  expect(found.payload).toEqual(input);
  expect(found.provider).toBe('synthetic');
  expect(found.formatVersion).toBe('1');
  expect(found.receivedAt).toBeInstanceOf(Date);
  expect(found.contentHash).toMatch(/^[a-f0-9]{64}$/);
  const indexes = await client
    .db(config.database)
    .collection('source_batches')
    .indexes();
  expect(indexes.find((v) => v.name === 'unique_source_content')?.unique).toBe(
    true,
  );
  await expect(
    client
      .db(config.database)
      .collection('source_batches')
      .insertOne({ ...found, _id: new ObjectId() }),
  ).rejects.toMatchObject({ code: 11000 });
});
it('deduplicates concurrent stores and reordered keys; retains the first receipt timestamp', async () => {
  const input = batch();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => store(input)),
  );
  expect(new Set(results.map((v) => v.document._id.toHexString())).size).toBe(
    1,
  );
  expect(results.filter((v) => !v.duplicate)).toHaveLength(1);
  const reordered = await store({
    games: input.games,
    version: input.version,
    provider: input.provider,
  });
  expect(reordered.duplicate).toBe(true);
  expect(reordered.document.receivedAt).toEqual(results[0].document.receivedAt);
  const changed = await store({
    ...input,
    games: [{ ...input.games[0], title: 'Different content' }],
  });
  expect(changed.document._id).not.toEqual(results[0].document._id);
});
it('paginates a half-open period with timestamp ties, stable IDs and query-bound cursors', async () => {
  const at = '2001-01-01T00:00:00.000Z';
  const end = '2001-01-02T00:00:00.000Z';
  const created = [];
  for (let i = 0; i < 5; i++) created.push((await store(batch())).document._id);
  // Change only this test's synthetic timestamps to force a tie and an upper-bound exclusion.
  const col = client.db(config.database).collection('source_batches');
  await col.updateMany(
    { _id: { $in: created } },
    { $set: { receivedAt: new Date(at) } },
  );
  await col.updateOne(
    { _id: created[4] },
    { $set: { receivedAt: new Date(end) } },
  );
  const query = { provider: 'synthetic', from: at, to: end, limit: 2 };
  const first = await archive.list(query);
  expect(first.items).toHaveLength(2);
  expect(first.items[0]).not.toHaveProperty('payload');
  assert.ok(first.nextCursor);
  const second = await archive.list({ ...query, cursor: first.nextCursor });
  expect(second.items).toHaveLength(2);
  expect(second.nextCursor).toBeNull();
  const found = [...first.items, ...second.items].map((v) =>
    v._id.toHexString(),
  );
  expect(found).toEqual(
    created
      .slice(0, 4)
      .map((v) => v.toHexString())
      .sort(),
  );
  expect(
    await archive.list({ ...query, from: end, to: '2001-01-03T00:00:00.000Z' }),
  ).toMatchObject({ items: [expect.anything()] });
  await expect(
    archive.list({
      ...query,
      from: '2000-01-01T00:00:00.000Z',
      cursor: first.nextCursor,
    }),
  ).rejects.toThrow('INVALID_CURSOR');
  await expect(
    archive.list({ ...query, provider: '{"$ne":null}' }),
  ).rejects.toThrow('INVALID_PROVIDER');
  await expect(archive.list({ ...query, limit: 101 })).rejects.toThrow(
    'INVALID_QUERY',
  );
  await expect(archive.list({ ...query, cursor: 'bad' })).rejects.toThrow(
    'INVALID_CURSOR',
  );
});
it('reprocesses into real PostgreSQL, repeats unchanged, updates and preserves absent records', async () => {
  const input = batch();
  const other = batch().games[0];
  input.games.push(other);
  const stored = await store(input);
  const importer = new CatalogImportService(prisma);
  const id = stored.document._id.toHexString();
  expect(await archive.reprocess(id, importer)).toEqual({
    created: 2,
    updated: 0,
    unchanged: 0,
    rejected: 0,
  });
  const scope = {
    provider: 'synthetic',
    externalId: { in: input.games.map((v) => v.externalId) },
  };
  const before = await prisma.gameSource.findMany({
    where: scope,
    include: { game: true },
    orderBy: { externalId: 'asc' },
  });
  expect(before).toHaveLength(2);
  expect(await archive.reprocess(id, importer)).toEqual({
    created: 0,
    updated: 0,
    unchanged: 2,
    rejected: 0,
  });
  expect(
    await prisma.gameSource.findMany({
      where: scope,
      include: { game: true },
      orderBy: { externalId: 'asc' },
    }),
  ).toEqual(before);
  const changed = await store({
    ...input,
    games: [{ ...input.games[0], title: 'Updated from archive' }],
  });
  expect(
    await archive.reprocess(changed.document._id.toHexString(), importer),
  ).toEqual({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
  const after = await prisma.gameSource.findMany({
    where: scope,
    include: { game: true },
    orderBy: { externalId: 'asc' },
  });
  expect(after.map((v) => v.gameId)).toEqual(before.map((v) => v.gameId));
  expect(
    after.find((v) => v.externalId === input.games[0].externalId)?.game.title,
  ).toBe('Updated from archive');
  expect(after.find((v) => v.externalId === other.externalId)).toEqual(
    before.find((v) => v.externalId === other.externalId),
  );
});
it('retains safe invalid records and importer rejection counts without writing invalid games', async () => {
  const input = batch();
  const stored = await store({
    ...input,
    games: [null, { title: '' }, input.games[0], input.games[0]],
  });
  expect(
    await archive.reprocess(
      stored.document._id.toHexString(),
      new CatalogImportService(prisma),
    ),
  ).toEqual({ created: 1, updated: 0, unchanged: 0, rejected: 3 });
  expect(
    await prisma.gameSource.count({
      where: { externalId: input.games[0].externalId },
    }),
  ).toBe(1);
});
it('preserves the document after a mid-transaction failure; PostgreSQL rolls back and retry succeeds', async () => {
  const input = batch();
  input.games.push(batch().games[0]);
  const stored = await store(input);
  const id = stored.document._id.toHexString();
  const gameCountBeforeFailure = await prisma.game.count();
  const originalHash = hashModule.sourceGameHash;
  const spy = vi
    .spyOn(hashModule, 'sourceGameHash')
    .mockImplementationOnce(originalHash)
    .mockImplementationOnce(() => {
      throw new Error('Simulated transformation failure');
    });
  try {
    await expect(
      archive.reprocess(id, new CatalogImportService(prisma)),
    ).rejects.toThrow('IMPORT_FAILED_DOCUMENT_RETAINED');
  } finally {
    spy.mockRestore();
  }
  expect(await archive.get(id)).toEqual(stored.document);
  expect(await prisma.game.count()).toBe(gameCountBeforeFailure);
  expect(
    await prisma.gameSource.count({
      where: { externalId: { in: input.games.map((v) => v.externalId) } },
    }),
  ).toBe(0);
  expect(
    await archive.reprocess(id, new CatalogImportService(prisma)),
  ).toMatchObject({ created: 2 });
});
it('fails on missing/tampered documents before invoking PostgreSQL', async () => {
  const importer = { importBatch: vi.fn() };
  await expect(
    archive.reprocess(new ObjectId().toHexString(), importer),
  ).rejects.toThrow('DOCUMENT_NOT_FOUND');
  const saved = await store(batch());
  await client
    .db(config.database)
    .collection('source_batches')
    .updateOne(
      { _id: saved.document._id },
      { $set: { 'payload.games.0.title': 'Tampered' } },
    );
  await expect(
    archive.reprocess(saved.document._id.toHexString(), importer),
  ).rejects.toThrow('DOCUMENT_INTEGRITY_FAILED');
  expect(importer.importBatch).not.toHaveBeenCalled();
});
it('sanitizes Mongo connection/write failures and does not call the importer', async () => {
  await expect(
    SourceArchive.connect({
      ...config,
      uri: config.uri.replace(/:[^:@]+@/, ':wrong@'),
    }),
  ).rejects.toThrow('ARCHIVE_UNAVAILABLE');
  const separate = await SourceArchive.connect(config);
  await separate.close();
  await expect(separate.store(JSON.stringify(batch()))).rejects.toThrow(
    'ARCHIVE_WRITE_FAILED_RETRY_SAFE',
  );
  const importer = { importBatch: vi.fn() };
  await expect(
    separate.reprocess(new ObjectId().toHexString(), importer),
  ).rejects.toThrow('ARCHIVE_UNAVAILABLE');
  expect(importer.importBatch).not.toHaveBeenCalled();
});
it('retains the document across a real PostgreSQL outage and imports after test database recovery', async () => {
  const stored = await store(batch());
  const id = stored.document._id.toHexString();
  const stop = spawnSync(
    'docker',
    ['compose', '--profile', 'test', 'stop', 'db-test'],
    { stdio: 'pipe' },
  );
  assert.equal(stop.status, 0);
  try {
    await expect(
      archive.reprocess(id, new CatalogImportService(prisma)),
    ).rejects.toThrow('IMPORT_FAILED_DOCUMENT_RETAINED');
    expect(await archive.get(id)).toEqual(stored.document);
  } finally {
    const restore = spawnSync('npm', ['run', 'test:db:prepare'], {
      stdio: 'pipe',
    });
    assert.equal(restore.status, 0, 'Test database recovery failed');
  }
  expect(
    await archive.reprocess(id, new CatalogImportService(prisma)),
  ).toMatchObject({ created: 1 });
  expect(
    await prisma.gameSource.count({
      where: {
        externalId:
          stored.document.payload.games[0] &&
          (stored.document.payload.games[0] as { externalId: string })
            .externalId,
      },
    }),
  ).toBe(1);
});
