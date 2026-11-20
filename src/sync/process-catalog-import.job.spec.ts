import { vi } from 'vitest';
import { REPROCESS_SOURCE_JOB } from './catalog-import.job.js';
import { processCatalogImportJob } from './process-catalog-import.job.js';

const documentId = '0123456789abcdef01234567';

it('encaminha o documento ao arquivo e retorna os contadores', async () => {
  const result = {
    created: 3,
    updated: 0,
    unchanged: 0,
    rejected: 0,
  };
  const archive = {
    reprocess: vi.fn().mockResolvedValue(result),
  };
  const importer = {
    importBatch: vi.fn(),
  };

  await expect(
    processCatalogImportJob(
      REPROCESS_SOURCE_JOB,
      { documentId },
      archive,
      importer,
    ),
  ).resolves.toEqual(result);

  expect(archive.reprocess).toHaveBeenCalledExactlyOnceWith(
    documentId,
    importer,
  );
});

it('rejeita nome ou payload inválido antes de chamar o arquivo', async () => {
  const archive = { reprocess: vi.fn() };
  const importer = { importBatch: vi.fn() };

  await expect(
    processCatalogImportJob('unknown-job', { documentId }, archive, importer),
  ).rejects.toThrow('Unsupported catalog import job');

  await expect(
    processCatalogImportJob(
      REPROCESS_SOURCE_JOB,
      { documentId, token: 'synthetic-test-token' },
      archive,
      importer,
    ),
  ).rejects.toThrow('Invalid catalog import job');

  expect(archive.reprocess).not.toHaveBeenCalled();
  expect(importer.importBatch).not.toHaveBeenCalled();
});

it('propaga a falha do reprocessamento sem retornar sucesso', async () => {
  const failure = new Error('IMPORT_FAILED_DOCUMENT_RETAINED');
  const archive = {
    reprocess: vi.fn().mockRejectedValue(failure),
  };
  const importer = { importBatch: vi.fn() };

  await expect(
    processCatalogImportJob(
      REPROCESS_SOURCE_JOB,
      { documentId },
      archive,
      importer,
    ),
  ).rejects.toBe(failure);
});
