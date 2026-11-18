import { ArchiveError } from './source-document.js';

export interface ArchiveConfig {
  uri: string;
  database: string;
}
export function archiveConfig(
  uri: string | undefined,
  testing = false,
): ArchiveConfig {
  try {
    const url = new URL(uri ?? '');
    const database = testing
      ? 'game_catalog_sources_test'
      : 'game_catalog_sources';
    const username = testing ? 'source_archive_test_app' : 'source_archive_app';
    if (
      url.protocol !== 'mongodb:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== (testing ? '27019' : '27018') ||
      url.pathname !== `/${database}` ||
      decodeURIComponent(url.username) !== username ||
      !url.password ||
      url.searchParams.get('authSource') !== database ||
      [...url.searchParams].length !== 1 ||
      url.hash
    ) {
      throw new Error();
    }
    return { uri: url.href, database };
  } catch {
    throw new ArchiveError('INVALID_LOCAL_MONGODB_CONFIGURATION');
  }
}

export function assertDevelopmentPostgres(uri: string | undefined): void {
  try {
    const url = new URL(uri ?? '');
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '5436' ||
      url.pathname !== '/game_catalog' ||
      decodeURIComponent(url.username) !== 'game_catalog_app' ||
      url.searchParams.get('schema') !== 'catalog' ||
      [...url.searchParams].length !== 1 ||
      !url.password ||
      !!url.hash
    )
      throw new Error();
  } catch {
    throw new ArchiveError('INVALID_LOCAL_POSTGRES_CONFIGURATION');
  }
}
