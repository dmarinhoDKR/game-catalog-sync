import { parseCatalogImportJob } from './catalog-import.job.js';

const documentId = '0123456789abcdef01234567';

it('aceita somente a referência ao documento arquivado', () => {
  expect(parseCatalogImportJob({ documentId }))
    .toEqual({ documentId });
});

it('rejeita formatos e campos extras', () => {
  const invalidInputs = [
    undefined,
    null,
    [],
    documentId,
    {},
    { documentId: 123 },
    { documentId, payload: {} },
    { documentId, token: 'synthetic-test-token' },
  ];

  for (const input of invalidInputs) {
    expect(() => parseCatalogImportJob(input))
      .toThrow('Invalid catalog import job');
  }
});

it('rejeita IDs que não seguem o contrato do arquivo documental', () => {
  for (const id of [
    '',
    'not-an-id',
    'a'.repeat(23),
    'a'.repeat(25),
    'g'.repeat(24),
    'ABCDEF0123456789ABCDEF01',
  ]) {
    expect(() => parseCatalogImportJob({ documentId: id }))
      .toThrow('INVALID_DOCUMENT_ID');
  }
});
