import { parseSourceGame } from "./parse-source-game.js";

const valid = {
  externalId: 'nebula-courier',
  title: ' Nebula Courier ',
  description: ' Synthetic description. ',
  genres: ['Simulation', 'Adventure', 'Simulation'],
};

it('normaliza textos e gêneros sem alterar a identidade externa', () => {
  expect(parseSourceGame(valid)).toEqual({
    externalId: 'nebula-courier',
    title: 'Nebula Courier',
    description: 'Synthetic description.',
    genres: ['Adventure', 'Simulation'],
  });
});

it('rejeita registros inválidos e campos extras', () => {
  for (const value of [
    null,
    [],
    {},
    { ...valid, externalId: '../invalid' },
    { ...valid, title: ' ' },
    { ...valid, description: 123 },
    { ...valid, genres: [] },
    { ...valid, genres: ['Puzzle', null] },
    { ...valid, gameId: 'client-supplied-id' },
  ]) {
    expect(parseSourceGame(value)).toBeNull();
  }
});

it('aceita os limites máximos e rejeita valores acima deles', () => {
  const boundary = {
    externalId: 'a'.repeat(100),
    title: 't'.repeat(200),
    description: 'd'.repeat(10000),
    genres: Array.from(
      { length: 20 },
      (_, index) => `${index}`.padEnd(50, 'g'),
    ),
  };

  expect(parseSourceGame(boundary)).not.toBeNull();

  for (const value of [
    { ...boundary, externalId: 'a'.repeat(101) },
    { ...boundary, title: 't'.repeat(201) },
    { ...boundary, description: 'd'.repeat(10001) },
    { ...boundary, genres: Array(21).fill('Puzzle') },
    { ...boundary, genres: ['g'.repeat(51)] },
    { ...boundary, genres: [' '] },
  ]) {
    expect(parseSourceGame(value)).toBeNull();
  }
});
