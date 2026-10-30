import { createHash } from 'node:crypto';
import type { SourceGame } from './parse-source-game.js';

export function sourceGameHash(game: SourceGame): string {
  const content = JSON.stringify({
    title: game.title,
    description: game.description,
    genres: game.genres,
  });

  return createHash('sha256').update(content, 'utf8').digest('hex');
}
