import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

it('persiste avaliação e rejeita duplicidade por usuário e jogo', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [PrismaModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const userId = randomUUID();
  const gameId = randomUUID();

  try {
    await app.init();

    const prisma = app.get(PrismaService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    try {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          passwordHash: 'test-placeholder-not-a-valid-password-hash',
        },
      });

      await prisma.game.create({
        data: {
          id: gameId,
          title: 'Review Test Game',
          description: 'Synthetic persistence test record.',
          genres: ['Puzzle'],
        },
      });

      const review = await prisma.review.create({
        data: {
          userId,
          gameId,
          rating: 1,
          body: 'Synthetic review.',
        },
      });

      expect(review).toMatchObject({
        userId,
        gameId,
        rating: 1,
        body: 'Synthetic review.',
      });

      const updated = await prisma.review.update({
        where: { id: review.id },
        data: { rating: 5 },
      });

      expect(updated.rating).toBe(5);

      for (const rating of [0, 6]) {
        await expect(
          prisma.review.update({
            where: { id: review.id },
            data: { rating },
          }),
        ).rejects.toMatchObject({
          meta: {
            driverAdapterError: {
              cause: {
                code: '23514',
              },
            },
          },
        });
      }

      const preserved = await prisma.review.findUniqueOrThrow({
        where: { id: review.id },
      });

      expect(preserved.rating).toBe(5);

      await expect(
        prisma.review.create({
          data: {
            userId,
            gameId,
            rating: 3,
            body: 'Duplicate review.',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      for (const references of [
        { userId: randomUUID(), gameId },
        { userId, gameId: randomUUID() },
      ]) {
        await expect(
          prisma.review.create({
            data: {
              ...references,
              rating: 3,
              body: 'Invalid reference test.',
            },
          }),
        ).rejects.toMatchObject({ code: 'P2003' });
      }

      await expect(
        prisma.user.delete({ where: { id: userId } }),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expect(
        prisma.game.delete({ where: { id: gameId } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    } finally {
      await prisma.review.deleteMany({ where: { userId } });
      await prisma.game.deleteMany({ where: { id: gameId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  } finally {
    await app.close();
  }
});
