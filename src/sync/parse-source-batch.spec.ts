import { readFileSync } from 'node:fs';
import { parseSourceBatch } from './parse-source-batch.js';

const fixture: unknown = JSON.parse(
  readFileSync(
    new URL('../../test/fixtures/catalog-v1.json', import.meta.url),
    'utf8',
  ),
);

it('aceita a fixture com três jogos e nenhuma rejeição', () => {
  const batch = parseSourceBatch(fixture);

  expect(batch.provider).toBe('synthetic');
  expect(batch.version).toBe('1');
  expect(batch.games).toHaveLength(3);
  expect(batch.rejected).toBe(0);
});

it('conta inválidos e duplicados, preservando o primeiro registro válido', () => {
  const game = parseSourceBatch(fixture).games[0];

  const batch = parseSourceBatch({
    provider: 'synthetic',
    version: '1',
    games: [
      null,
      { ...game, title: ' ' },
      game,
      { ...game, title: 'Duplicate title' },
    ],
  });

  expect(batch.games).toEqual([game]);
  expect(batch.rejected).toBe(3);
});

it('rejeita envelopes inválidos e aceita lote vazio', () => {
  const empty = {
    provider: 'synthetic',
    version: '1',
    games: [],
  };

  expect(parseSourceBatch(empty).games).toEqual([]);

  for (const value of [
    null,
    [],
    {},
    { ...empty, provider: 'unknown' },
    { ...empty, version: '2' },
    { ...empty, games: 'invalid' },
    { ...empty, games: Array(1001).fill(null) },
    { ...empty, extra: true },
  ]) {
    expect(() => parseSourceBatch(value))
      .toThrow('Invalid source batch');
  }
});
