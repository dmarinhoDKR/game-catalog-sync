import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  archiveConfig,
  assertDevelopmentPostgres,
} from '../source-documents/archive-config.js';
import { SourceArchive } from '../source-documents/source-archive.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogImportService } from './catalog-import.service.js';
import { SyncModule } from './sync.module.js';
import { redisQueueOptions } from './redis-queue.options.js';
import { createCatalogImportWorker } from './catalog-import.worker.js';

async function withinStartupTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Worker startup timeout')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Local worker only');
  }

  assertDevelopmentPostgres(process.env.DATABASE_URL);
  const mongoConfig = archiveConfig(process.env.MONGODB_URI);
  const redisOptions = redisQueueOptions(
    process.env.REDIS_QUEUE_URL,
    'worker',
  );

  let app: INestApplicationContext | undefined;
  let archive: SourceArchive | undefined;
  let connection: Redis | undefined;
  let worker: ReturnType<typeof createCatalogImportWorker> | undefined;
  let ready = false;
  let shutdownPromise: Promise<void> | undefined;

  function shutdown(force = false): Promise<void> {
    shutdownPromise ??= (async () => {
      try {
        await worker?.close(force);
      } finally {
        connection?.disconnect();
        try {
          await archive?.close();
        } finally {
          await app?.close();
        }
      }
    })();

    return shutdownPromise;
  }

  function onSignal(): void {
    console.log('Encerrando worker; aguardando o job ativo.');
    void shutdown().catch(() => {
      console.error('Falha no encerramento do worker.');
      process.exitCode = 1;
    });
  }

  try {
    app = await NestFactory.createApplicationContext(SyncModule, {
      logger: false,
      abortOnError: false,
    });

    const prisma = app.get(PrismaService);
    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    if (
      identity?.username !== 'game_catalog_app' ||
      identity.database !== 'game_catalog'
    ) {
      throw new Error('Unexpected PostgreSQL identity');
    }

    archive = await SourceArchive.connect(mongoConfig);
    connection = new Redis(redisOptions);
    connection.on('error', () => {
      console.error('Conexão Redis indisponível.');
    });

    await withinStartupTimeout(connection.connect());

    worker = createCatalogImportWorker(
      connection,
      archive,
      app.get(CatalogImportService),
    );

    worker.on('error', () => {
      console.error('Erro operacional no worker.');
    });
    worker.on('completed', job => {
      console.log(JSON.stringify({
        event: 'catalog-import.completed',
        jobId: job.id,
      }));
    });
    worker.on('failed', job => {
      console.error(JSON.stringify({
        event: 'catalog-import.failed',
        jobId: job?.id,
      }));
    });

    await withinStartupTimeout(worker.waitUntilReady());
    ready = true;

    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    console.log('Worker local pronto para processar importações.');
    await worker.run();
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await shutdown(!ready);
  }
}

main().catch(() => {
  console.error('Worker encerrado com erro; detalhes sensíveis omitidos.');
  process.exitCode = 1;
});
