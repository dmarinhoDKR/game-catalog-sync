import { parseSourceGame } from './parse-source-game.js';
import type { SourceGame } from './parse-source-game.js';

export interface SourceBatch {
  provider: 'synthetic';
  version: '1';
  games: SourceGame[];
  rejected: number;
}

export function parseSourceBatch(value: unknown): SourceBatch {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some(
      key => !['provider', 'version', 'games'].includes(key),
    ) ||
    !('provider' in value) ||
    value.provider !== 'synthetic' ||
    !('version' in value) ||
    value.version !== '1' ||
    !('games' in value) ||
    !Array.isArray(value.games) ||
    value.games.length > 1000
  ) {
    throw new Error('Invalid source batch');
  }

  const games: SourceGame[] = [];
  const identities = new Set<string>();
  let rejected = 0;

  for (const entry of value.games) {
    const game = parseSourceGame(entry);

    if (!game || identities.has(game.externalId)) {
      rejected++;
      continue;
    }

    identities.add(game.externalId);
    games.push(game);
  }

  return {
    provider: value.provider,
    version: value.version,
    games,
    rejected,
  };
}
