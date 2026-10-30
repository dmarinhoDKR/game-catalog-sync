import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseSourceBatch } from './parse-source-batch.js';
import { sourceGameHash } from './source-game-hash.js';

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
}

@Injectable()
export class CatalogImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importBatch(input: unknown): Promise<ImportResult> {
    const batch = parseSourceBatch(input);

    return this.prisma.$transaction(
      async tx => {
        const result: ImportResult = {
          created: 0,
          updated: 0,
          unchanged: 0,
          rejected: batch.rejected,
        };

        for (const game of batch.games) {
          const identity = {
            provider: batch.provider,
            externalId: game.externalId,
          };

          const contentHash = sourceGameHash(game);

          const existing = await tx.gameSource.findUnique({
            where: { provider_externalId: identity },
            select: {
              contentHash: true,
            },
          });

          if (existing?.contentHash === contentHash) {
            result.unchanged++;
            continue;
          }

          const content = {
            title: game.title,
            description: game.description,
            genres: game.genres,
          };

          if (existing) {
            await tx.gameSource.update({
              where: { provider_externalId: identity },
              data: {
                contentHash,
                game: {
                  update: content,
                },
              },
            });

            result.updated++;
          } else {
            await tx.gameSource.create({
              data: {
                ...identity,
                contentHash,
                game: {
                  create: content,
                },
              },
            });

            result.created++;
          }
        }

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      },
    );
  }
}
