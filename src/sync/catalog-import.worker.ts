import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { SourceArchive } from '../source-documents/source-archive.js';
import type {
  CatalogImportService,
  ImportResult,
} from './catalog-import.service.js';
import { CATALOG_IMPORT_QUEUE } from './catalog-import.job.js';
import { CATALOG_QUEUE_PREFIX } from './redis-queue.options.js';
import { processCatalogImportJob } from './process-catalog-import.job.js';

export function createCatalogImportWorker(
  connection: Redis,
  archive: Pick<SourceArchive, 'reprocess'>,
  importer: Pick<CatalogImportService, 'importBatch'>,
): Worker<unknown, ImportResult> {
  return new Worker<unknown, ImportResult>(
    CATALOG_IMPORT_QUEUE,
    job => processCatalogImportJob(
      job.name,
      job.data,
      archive,
      importer,
    ),
    {
      connection,
      prefix: CATALOG_QUEUE_PREFIX,
      concurrency: 1,
      autorun: false,
    },
  );
}
