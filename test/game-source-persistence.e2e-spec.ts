import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

it('persiste origem e protege identidade externa e referência ao jogo', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [PrismaModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const gameId = randomUUID();
  const externalId = randomUUID();
  const provider = 'synthetic-test';
  const otherProvider = 'other-synthetic-test';

  try {
    await app.init();

    const prisma = app.get(PrismaService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    try {
      await prisma.game.create({
        data: {
          id: gameId,
          title: 'Game Source Test',
          description: 'Synthetic persistence test record.',
          genres: ['Puzzle'],
        },
      });

      const source = await prisma.gameSource.create({
        data: {
          provider,
          externalId,
          gameId,
          contentHash: 'a'.repeat(64),
        },
      });

      expect(source).toEqual({
        provider,
        externalId,
        gameId,
        contentHash: 'a'.repeat(64),
      });

      await expect(
        prisma.gameSource.create({
          data: {
            provider,
            externalId,
            gameId,
            contentHash: 'b'.repeat(64),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.gameSource.create({
        data: {
          provider: otherProvider,
          externalId,
          gameId,
          contentHash: 'c'.repeat(64),
        },
      });

      expect(
        await prisma.gameSource.count({ where: { gameId } }),
      ).toBe(2);

      await expect(
        prisma.gameSource.create({
          data: {
            provider,
            externalId: randomUUID(),
            gameId: randomUUID(),
            contentHash: 'd'.repeat(64),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expect(
        prisma.game.delete({ where: { id: gameId } }),
      ).rejects.toMatchObject({ code: 'P2003' });

      expect(
        await prisma.gameSource.findUniqueOrThrow({
          where: {
            provider_externalId: { provider, externalId },
          },
        }),
      ).toEqual(source);
    } finally {
      await prisma.gameSource.deleteMany({ where: { gameId } });
      await prisma.game.deleteMany({ where: { id: gameId } });
    }
  } finally {
    await app.close();
  }
});
