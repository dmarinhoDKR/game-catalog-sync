import 'dotenv/config';
import { open } from 'node:fs/promises';
import { archiveConfig, assertDevelopmentPostgres } from './archive-config.js';
import { SourceArchive } from './source-archive.js';
import {
  ArchiveError,
  MAX_SOURCE_BYTES,
  prepareDocument,
} from './source-document.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogImportService } from '../sync/catalog-import.service.js';

async function readSource(path: string): Promise<string> {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES)
      throw new ArchiveError('INVALID_FILE_OR_SIZE');
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        size,
        buffer.length - size,
        size,
      );
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_SOURCE_BYTES) throw new ArchiveError('DOCUMENT_TOO_LARGE');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(0, size),
    );
  } finally {
    await file.close();
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new ArchiveError('LOCAL_COMMAND_ONLY');
  const [command, ...args] = process.argv.slice(2);
  if (
    !['store', 'get', 'list', 'reprocess'].includes(command) ||
    (command !== 'list' && args.length !== 1) ||
    (command === 'list' && (args.length < 3 || args.length > 5))
  ) {
    throw new ArchiveError(
      'USAGE: store FILE | get ID | reprocess ID | list synthetic FROM_ISO TO_ISO [LIMIT] [CURSOR]',
    );
  }
  const json = command === 'store' ? await readSource(args[0]) : undefined;
  if (json !== undefined) prepareDocument(json);
  if (command === 'reprocess')
    assertDevelopmentPostgres(process.env.DATABASE_URL);
  const archive = await SourceArchive.connect(
    archiveConfig(process.env.MONGODB_URI),
  );
  try {
    if (command === 'store') {
      const { document, duplicate } = await archive.store(json!);
      console.log(
        JSON.stringify({
          id: document._id,
          contentHash: document.contentHash,
          duplicate,
        }),
      );
    } else if (command === 'get') {
      console.log(JSON.stringify(await archive.get(args[0]), null, 2));
    } else if (command === 'list') {
      console.log(
        JSON.stringify(
          await archive.list({
            provider: args[0],
            from: args[1],
            to: args[2],
            limit: args[3] === undefined ? 20 : Number(args[3]),
            cursor: args[4],
          }),
          null,
          2,
        ),
      );
    } else {
      const prisma = new PrismaService();
      try {
        const [identity] = await prisma.$queryRaw<
          { username: string; database: string }[]
        >`
          SELECT current_user AS username, current_database() AS database`;
        if (
          identity?.username !== 'game_catalog_app' ||
          identity.database !== 'game_catalog'
        ) {
          throw new ArchiveError('INVALID_DATABASE_IDENTITY');
        }
        console.log(
          JSON.stringify(
            await archive.reprocess(args[0], new CatalogImportService(prisma)),
          ),
        );
      } finally {
        await prisma.$disconnect();
      }
    }
  } finally {
    await archive.close();
  }
}

main().catch((error) => {
  // Never print driver messages, connection URIs, SQL, payloads or stack traces.
  console.error(
    error instanceof ArchiveError ? error.message : 'SOURCE_COMMAND_FAILED',
  );
  process.exitCode = 1;
});
