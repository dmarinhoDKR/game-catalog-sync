import { parseArchiveId } from '../source-documents/source-document.js';

export const CATALOG_IMPORT_QUEUE = 'catalog-import';
export const REPROCESS_SOURCE_JOB = 'reprocess-source';

export interface CatalogImportJobData {
  documentId: string;
}

export function parseCatalogImportJob(
  value: unknown,
): CatalogImportJobData {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some(key => key !== 'documentId') ||
    !('documentId' in value) ||
    typeof value.documentId !== 'string'
  ) {
    throw new Error('Invalid catalog import job');
  }

  return {
    documentId: parseArchiveId(value.documentId),
  };
}
