import type { SourceArchive } from '../source-documents/source-archive.js';
import type {
  CatalogImportService,
  ImportResult,
} from './catalog-import.service.js';
import {
  parseCatalogImportJob,
  REPROCESS_SOURCE_JOB,
} from './catalog-import.job.js';

export async function processCatalogImportJob(
  name: string,
  input: unknown,
  archive: Pick<SourceArchive, 'reprocess'>,
  importer: Pick<CatalogImportService, 'importBatch'>,
): Promise<ImportResult> {
  if (name !== REPROCESS_SOURCE_JOB) {
    throw new Error('Unsupported catalog import job');
  }

  const { documentId } = parseCatalogImportJob(input);

  return archive.reprocess(documentId, importer);
}
