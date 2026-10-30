export interface SourceGame {
  externalId: string;
  title: string;
  description: string;
  genres: string[];
}

export function parseSourceGame(value: unknown): SourceGame | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const allowed = ['externalId', 'title', 'description', 'genres'];

  if (Object.keys(value).some(key => !allowed.includes(key))) {
    return null;
  }

  if (
    !('externalId' in value) ||
    !('title' in value) ||
    !('description' in value) ||
    !('genres' in value)
  ) {
    return null;
  }

  const { externalId, title, description, genres } = value;

  if (
    typeof externalId !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(externalId) ||
    typeof title !== 'string' ||
    title.trim().length < 1 ||
    title.trim().length > 200 ||
    typeof description !== 'string' ||
    description.trim().length < 1 ||
    description.trim().length > 10000 ||
    !Array.isArray(genres) ||
    genres.length < 1 ||
    genres.length > 20
  ) {
    return null;
  }

  const normalizedGenres: string[] = [];

  for (const genre of genres) {
    if (
      typeof genre !== 'string' ||
      genre.trim().length < 1 ||
      genre.trim().length > 50
    ) {
      return null;
    }

    normalizedGenres.push(genre.trim());
  }

  return {
    externalId,
    title: title.trim(),
    description: description.trim(),
    genres: [...new Set(normalizedGenres)].sort(),
  };
}
