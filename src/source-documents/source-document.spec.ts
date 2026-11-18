import { spawnSync } from 'node:child_process';
import { archiveConfig, assertDevelopmentPostgres } from './archive-config.js';
import {
  MAX_SOURCE_BYTES,
  parseArchiveId,
  parseDate,
  prepareDocument,
} from './source-document.js';
const game = {
  externalId: 'game-one',
  title: 'Title',
  description: 'Synthetic content',
  genres: ['Puzzle'],
};
const batch = { provider: 'synthetic', version: '1', games: [game] };

it('hashes object key order identically but preserves record order and raw text', () => {
  const first = prepareDocument(JSON.stringify(batch));
  const reordered = {
    games: [
      {
        genres: ['Puzzle'],
        description: game.description,
        title: game.title,
        externalId: game.externalId,
      },
    ],
    version: '1',
    provider: 'synthetic',
  };
  expect(prepareDocument(JSON.stringify(reordered)).contentHash).toBe(
    first.contentHash,
  );
  expect(
    prepareDocument(
      JSON.stringify({ ...batch, games: [{ ...game, title: ' Title ' }] }),
    ).contentHash,
  ).not.toBe(first.contentHash);
  const pair = { ...batch, games: [game, { ...game, title: 'Other' }] };
  expect(prepareDocument(JSON.stringify(pair)).contentHash).not.toBe(
    prepareDocument(
      JSON.stringify({ ...pair, games: [...pair.games].reverse() }),
    ).contentHash,
  );
});
it('preserves safe invalid and duplicate records for importer rejection accounting', () => {
  const input = { ...batch, games: [null, { title: '' }, game, game] };
  expect(prepareDocument(JSON.stringify(input)).payload).toEqual(input);
});
it('rejects malformed JSON, unsupported source/version, extra credential fields and oversize input', () => {
  for (const input of [
    '{',
    JSON.stringify({ ...batch, provider: 'remote' }),
    JSON.stringify({ ...batch, version: '2' }),
    JSON.stringify({ ...batch, token: 'secret' }),
    JSON.stringify({ ...batch, games: [{ ...game, authorization: 'secret' }] }),
    JSON.stringify({
      ...batch,
      games: [{ ...game, genres: [{ token: 'secret' }] }],
    }),
    JSON.stringify({ ...batch, games: Array(1001).fill(null) }),
    ' '.repeat(MAX_SOURCE_BYTES + 1),
  ]) {
    expect(() => prepareDocument(input)).toThrow();
  }
});
it('rejects invalid dates and IDs', () => {
  expect(() => parseArchiveId('{"$ne":null}')).toThrow();
  expect(() => parseDate('2026-11-18')).toThrow();
  expect(() => parseDate('2026-02-30T00:00:00.000Z')).toThrow();
});
it('restricts Mongo configuration to separate authenticated local databases', () => {
  const uri =
    'mongodb://source_archive_test_app:password@127.0.0.1:27019/game_catalog_sources_test?authSource=game_catalog_sources_test';
  expect(archiveConfig(uri, true).database).toBe('game_catalog_sources_test');
  expect(() => archiveConfig(uri)).toThrow();
  for (const invalid of [
    undefined,
    uri.replace('127.0.0.1', 'example.com'),
    uri.replace('27019', '27018'),
    uri + '&tls=false',
    uri.replace('password@', '@'),
    uri.replace('source_archive_test_app:', 'root:'),
  ]) {
    expect(() => archiveConfig(invalid, true)).toThrow(
      'INVALID_LOCAL_MONGODB_CONFIGURATION',
    );
  }
});
it('restricts CLI PostgreSQL import target to local development', () => {
  const uri =
    'postgresql://game_catalog_app:password@127.0.0.1:5436/game_catalog?schema=catalog';
  expect(() => assertDevelopmentPostgres(uri)).not.toThrow();
  expect(() =>
    assertDevelopmentPostgres(uri.replace('5436', '5437')),
  ).toThrow();
  expect(() =>
    assertDevelopmentPostgres(uri.replace('game_catalog_app:', 'postgres:')),
  ).toThrow();
});

it('refuses connection-option overrides and prevents test runner touching development', () => {
  const development =
    'postgresql://game_catalog_app:password@127.0.0.1:5436/game_catalog?schema=catalog';
  expect(() =>
    assertDevelopmentPostgres(development + '&host=example.com'),
  ).toThrow();
  const result = spawnSync(process.execPath, ['scripts/test-documents.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, TEST_DATABASE_URL: development },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    'Invalid test database configuration; no services started.',
  );
});
