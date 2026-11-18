import { MongoClient, MongoServerError, ObjectId } from 'mongodb';
import type { Collection, Filter } from 'mongodb';
import type {
  CatalogImportService,
  ImportResult,
} from '../sync/catalog-import.service.js';
import type { ArchiveConfig } from './archive-config.js';
import {
  ArchiveError,
  canonicalJson,
  parseArchiveId,
  parseDate,
  prepareDocument,
} from './source-document.js';
import type { SourcePayload } from './source-document.js';

export interface StoredSource {
  _id: ObjectId;
  provider: 'synthetic';
  receivedAt: Date;
  formatVersion: '1';
  contentHash: string;
  payload: SourcePayload;
}
export interface ArchiveQuery {
  provider: string;
  from: string;
  to: string;
  limit?: number;
  cursor?: string;
}
const collectionName = 'source_batches';
const operationOptions = { maxTimeMS: 5000 };

export class SourceArchive {
  private constructor(
    private readonly client: MongoClient,
    private readonly collection: Collection<StoredSource>,
  ) {}

  static async connect(config: ArchiveConfig): Promise<SourceArchive> {
    const client = new MongoClient(config.uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 6000,
      maxPoolSize: 4,
      retryWrites: false,
      writeConcern: { w: 1, journal: true, wtimeoutMS: 5000 },
    });
    try {
      await client.connect();
      const db = client.db(config.database);
      try {
        await db.createCollection(collectionName, {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              additionalProperties: false,
              required: [
                '_id',
                'provider',
                'receivedAt',
                'formatVersion',
                'contentHash',
                'payload',
              ],
              properties: {
                _id: { bsonType: 'objectId' },
                provider: { enum: ['synthetic'] },
                receivedAt: { bsonType: 'date' },
                formatVersion: { enum: ['1'] },
                contentHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
                payload: { bsonType: 'object' },
              },
            },
          },
          ...operationOptions,
        });
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 48)
          throw error;
      }
      const collection = db.collection<StoredSource>(collectionName);
      await collection.createIndex(
        { provider: 1, formatVersion: 1, contentHash: 1 },
        { unique: true, name: 'unique_source_content', ...operationOptions },
      );
      await collection.createIndex(
        { provider: 1, receivedAt: 1, _id: 1 },
        { name: 'provider_received_id', ...operationOptions },
      );
      return new SourceArchive(client, collection);
    } catch {
      await client.close();
      throw new ArchiveError('ARCHIVE_UNAVAILABLE');
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async store(
    json: string,
  ): Promise<{ document: StoredSource; duplicate: boolean }> {
    const { payload, contentHash } = prepareDocument(json);
    const identity = {
      provider: payload.provider,
      formatVersion: payload.version,
      contentHash,
    };
    const document: StoredSource = {
      _id: new ObjectId(),
      ...identity,
      receivedAt: new Date(),
      payload,
    };
    try {
      await this.collection.insertOne(document, operationOptions);
      return { document, duplicate: false };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        try {
          const existing = await this.collection.findOne(
            identity,
            operationOptions,
          );
          if (existing) return { document: existing, duplicate: true };
        } catch {
          /* Return only the sanitized archive error below. */
        }
      }
      throw new ArchiveError('ARCHIVE_WRITE_FAILED_RETRY_SAFE');
    }
  }

  async get(id: string): Promise<StoredSource> {
    const _id = new ObjectId(parseArchiveId(id));
    let document: StoredSource | null;
    try {
      document = await this.collection.findOne({ _id }, operationOptions);
    } catch {
      throw new ArchiveError('ARCHIVE_UNAVAILABLE');
    }
    if (!document) throw new ArchiveError('DOCUMENT_NOT_FOUND');
    // Revalidate persisted content and integrity before returning or importing it.
    const prepared = prepareDocument(canonicalJson(document.payload));
    if (
      prepared.contentHash !== document.contentHash ||
      document.provider !== prepared.payload.provider ||
      document.formatVersion !== prepared.payload.version
    ) {
      throw new ArchiveError('DOCUMENT_INTEGRITY_FAILED');
    }
    return document;
  }

  async list(query: ArchiveQuery): Promise<{
    items: Omit<StoredSource, 'payload'>[];
    nextCursor: string | null;
  }> {
    if (query.provider !== 'synthetic')
      throw new ArchiveError('INVALID_PROVIDER');
    const from = parseDate(query.from);
    const to = parseDate(query.to);
    const limit = query.limit ?? 20;
    if (from >= to || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ArchiveError('INVALID_QUERY');
    }
    const filter: Filter<StoredSource> = {
      provider: query.provider,
      receivedAt: { $gte: from, $lt: to },
    };
    if (query.cursor !== undefined) {
      try {
        if (
          query.cursor.length > 2048 ||
          !/^[A-Za-z0-9_-]+$/.test(query.cursor)
        )
          throw new Error();
        const cursor = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8'),
        ) as Record<string, unknown>;
        if (
          cursor.provider !== query.provider ||
          cursor.from !== query.from ||
          cursor.to !== query.to ||
          typeof cursor.at !== 'string' ||
          typeof cursor.id !== 'string'
        )
          throw new Error();
        const at = parseDate(cursor.at);
        if (at < from || at >= to) throw new Error();
        filter.$or = [
          { receivedAt: { $gt: at } },
          {
            receivedAt: at,
            _id: { $gt: new ObjectId(parseArchiveId(cursor.id)) },
          },
        ];
      } catch {
        throw new ArchiveError('INVALID_CURSOR');
      }
    }
    try {
      const rows = await this.collection
        .find(filter, {
          projection: { payload: 0 },
          ...operationOptions,
        })
        .sort({ receivedAt: 1, _id: 1 })
        .limit(limit + 1)
        .toArray();
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor =
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                provider: query.provider,
                from: query.from,
                to: query.to,
                at: last.receivedAt.toISOString(),
                id: last._id.toHexString(),
              }),
            ).toString('base64url')
          : null;
      return { items, nextCursor };
    } catch {
      throw new ArchiveError('ARCHIVE_UNAVAILABLE');
    }
  }

  async reprocess(
    id: string,
    importer: Pick<CatalogImportService, 'importBatch'>,
  ): Promise<ImportResult> {
    const document = await this.get(id);
    // No cross-database transaction or status write: the immutable source survives a PG failure.
    try {
      return await importer.importBatch(document.payload);
    } catch {
      throw new ArchiveError('IMPORT_FAILED_DOCUMENT_RETAINED');
    }
  }
}
