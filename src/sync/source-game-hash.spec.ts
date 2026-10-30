import { parseSourceGame } from './parse-source-game.js';
import { sourceGameHash } from './source-game-hash.js';

const game = {
  externalId: 'nebula-courier',
  title: 'Nebula Courier',
  description: 'Synthetic description.',
  genres: ['Adventure', 'Simulation'],
};

it('gera hash estável e independente da identidade externa', () => {
  const hash = sourceGameHash(game);

  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(sourceGameHash({ ...game })).toBe(hash);
  expect(
    sourceGameHash({ ...game, externalId: 'another-id' }),
  ).toBe(hash);
});

it('detecta mudanças nos campos de conteúdo', () => {
  const hash = sourceGameHash(game);

  for (const changed of [
    { ...game, title: 'Updated title' },
    { ...game, description: 'Updated description.' },
    { ...game, genres: ['Puzzle'] },
  ]) {
    expect(sourceGameHash(changed)).not.toBe(hash);
  }
});

it('mantém o hash após normalizar espaços e ordem dos gêneros', () => {
  const normalized = parseSourceGame({
    ...game,
    title: ' Nebula Courier ',
    genres: ['Simulation', 'Adventure', 'Simulation'],
  });

  expect(normalized).not.toBeNull();

  if (!normalized) {
    throw new Error('Expected a valid source game');
  }

  expect(sourceGameHash(normalized)).toBe(sourceGameHash(game));
});
