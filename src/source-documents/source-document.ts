import { createHash } from 'node:crypto';
import { parseSourceBatch } from '../sync/parse-source-batch.js';

export const MAX_SOURCE_BYTES = 1024 * 1024;
export class ArchiveError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ArchiveError';
  }
}
export interface SourcePayload {
  provider: 'synthetic';
  version: '1';
  games: unknown[];
}

// This boundary accepts catalog fields only, never provider request headers or metadata.
// Text content still requires trusted synthetic input: no heuristic can prove it has no PII.
export function prepareDocument(json: string): {
  payload: SourcePayload;
  contentHash: string;
} {
  if (Buffer.byteLength(json, 'utf8') > MAX_SOURCE_BYTES) {
    throw new ArchiveError('DOCUMENT_TOO_LARGE');
  }
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new ArchiveError('INVALID_JSON');
  }
  try {
    parseSourceBatch(input);
  } catch {
    throw new ArchiveError('INVALID_BATCH');
  }
  const payload = input as SourcePayload;
  for (const record of payload.games) {
    if (record === null) continue; // Retain safe invalid records for importer rejection counts.
    if (typeof record !== 'object' || Array.isArray(record)) {
      throw new ArchiveError('UNSUPPORTED_RECORD_SHAPE');
    }
    for (const [key, value] of Object.entries(record)) {
      if (!['externalId', 'title', 'description', 'genres'].includes(key)) {
        throw new ArchiveError('UNSUPPORTED_RECORD_FIELD');
      }
      if (key === 'genres') {
        if (
          !Array.isArray(value) ||
          value.length > 20 ||
          value.some((v) => typeof v !== 'string' || v.length > 100)
        ) {
          throw new ArchiveError('UNSUPPORTED_RECORD_SHAPE');
        }
      } else if (typeof value !== 'string' || value.length > 20_000) {
        throw new ArchiveError('UNSUPPORTED_RECORD_SHAPE');
      }
    }
  }
  const canonical = canonicalJson(payload);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_SOURCE_BYTES) {
    throw new ArchiveError('DOCUMENT_TOO_LARGE');
  }
  return {
    payload,
    contentHash: createHash('sha256').update(canonical).digest('hex'),
  };
}

// Sort object keys only. Preserve arrays, whitespace inside strings and invalid records.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parseArchiveId(id: string): string {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ArchiveError('INVALID_DOCUMENT_ID');
  return id;
}

export function parseDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new ArchiveError('INVALID_DATE_USE_ISO_UTC');
  }
  return date;
}
