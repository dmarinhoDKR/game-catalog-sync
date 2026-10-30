import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CatalogImportService } from '../src/sync/catalog-import.service.js';
import { parseSourceBatch } from '../src/sync/parse-source-batch.js';
import { vi } from 'vitest';
import * as hashModule from '../src/sync/source-game-hash.js';

it('importa, repete sem alterações e atualiza sem duplicar jogos', async () => {
  const fixture: unknown = JSON.parse(
    readFileSync(
      new URL('./fixtures/catalog-v1.json', import.meta.url),
      'utf8',
    ),
  );

  const parsed = parseSourceBatch(fixture);
  const suffix = randomUUID();

  const batch = {
    provider: parsed.provider,
    version: parsed.version,
    games: parsed.games.map(game => ({
      ...game,
      externalId: `${game.externalId}-${suffix}`,
    })),
  };

  const externalIds = batch.games.map(game => game.externalId);
  const scope = {
    provider: batch.provider,
    externalId: { in: externalIds },
  };

  const moduleFixture = await Test.createTestingModule({
    imports: [PrismaModule],
    providers: [CatalogImportService],
  }).compile();

  const app = moduleFixture.createNestApplication();

  try {
    await app.init();

    const prisma = app.get(PrismaService);
    const importer = app.get(CatalogImportService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    try {
      expect(await importer.importBatch(batch)).toEqual({
        created: 3,
        updated: 0,
        unchanged: 0,
        rejected: 0,
      });

      const before = await prisma.gameSource.findMany({
        where: scope,
        include: { game: true },
        orderBy: { externalId: 'asc' },
      });

      expect(before).toHaveLength(3);

      expect(await importer.importBatch(batch)).toEqual({
        created: 0,
        updated: 0,
        unchanged: 3,
        rejected: 0,
      });

      expect(
        await prisma.gameSource.findMany({
          where: scope,
          include: { game: true },
          orderBy: { externalId: 'asc' },
        }),
      ).toEqual(before);

      const first = batch.games[0];
      const changed = {
        ...batch,
        games: [
          { ...first, title: 'Updated synthetic title' },
          ...batch.games.slice(1),
        ],
      };

      expect(await importer.importBatch(changed)).toEqual({
        created: 0,
        updated: 1,
        unchanged: 2,
        rejected: 0,
      });

      const after = await prisma.gameSource.findMany({
        where: scope,
        include: { game: true },
        orderBy: { externalId: 'asc' },
      });

      expect(after).toHaveLength(3);
      expect(after.map(source => source.gameId))
        .toEqual(before.map(source => source.gameId));

      const original = before.find(
        source => source.externalId === first.externalId,
      );
      const updated = after.find(
        source => source.externalId === first.externalId,
      );

      assert.ok(original);
      assert.ok(updated);

      expect(updated.game.title).toBe('Updated synthetic title');
      expect(updated.contentHash).not.toBe(original.contentHash);

      for (const source of after) {
        if (source.externalId !== first.externalId) {
          expect(source).toEqual(
            before.find(item => item.externalId === source.externalId),
          );
        }
      }

      expect(
        await importer.importBatch({
          ...changed,
          games: [changed.games[0]],
        }),
      ).toEqual({
        created: 0,
        updated: 0,
        unchanged: 1,
        rejected: 0,
      });

      expect(
        await prisma.gameSource.findMany({
          where: scope,
          include: { game: true },
          orderBy: { externalId: 'asc' },
        }),
      ).toEqual(after);

      const mixedGame = {
        ...changed.games[0],
        description: 'Updated through a mixed batch.',
      };

      expect(
        await importer.importBatch({
          ...changed,
          games: [
            null,
            { ...mixedGame, title: ' ' },
            mixedGame,
            { ...mixedGame, title: 'Rejected duplicate' },
          ],
        }),
      ).toEqual({
        created: 0,
        updated: 1,
        unchanged: 0,
        rejected: 3,
      });

      const mixedSource = await prisma.gameSource.findUniqueOrThrow({
        where: {
          provider_externalId: {
            provider: batch.provider,
            externalId: mixedGame.externalId,
          },
        },
        include: { game: true },
      });

      expect(mixedSource.game.description)
        .toBe('Updated through a mixed batch.');
      expect(mixedSource.game.title).toBe(mixedGame.title);
      expect(
        await prisma.gameSource.count({ where: scope }),
      ).toBe(3);

      const beforeFailure = await prisma.gameSource.findMany({
        where: scope,
        include: { game: true },
        orderBy: { externalId: 'asc' },
      });

      const originalHash = hashModule.sourceGameHash;
      const hashSpy = vi.spyOn(hashModule, 'sourceGameHash');

      hashSpy
        .mockImplementationOnce(originalHash)
        .mockImplementationOnce(() => {
          throw new Error('Synthetic import failure');
        });

      try {
        await expect(
          importer.importBatch({
            ...changed,
            games: [
              { ...mixedGame, title: 'Must be rolled back' },
              changed.games[1],
            ],
          }),
        ).rejects.toThrow('Synthetic import failure');
      } finally {
        hashSpy.mockRestore();
      }

      expect(
        await prisma.gameSource.findMany({
          where: scope,
          include: { game: true },
          orderBy: { externalId: 'asc' },
        }),
      ).toEqual(beforeFailure);
    } finally {
      const sources = await prisma.gameSource.findMany({
        where: scope,
        select: { gameId: true },
      });

      await prisma.gameSource.deleteMany({ where: scope });
      await prisma.game.deleteMany({
        where: { id: { in: sources.map(source => source.gameId) } },
      });
    }
  } finally {
    await app.close();
  }
});
