import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReviewsService } from '../src/reviews/reviews.service.js';
import { execFileSync } from 'node:child_process';

it('cria e atualiza a avaliação do mesmo usuário sem duplicar', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [PrismaModule],
    providers: [ReviewsService],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const gameId = randomUUID();

  try {
    await app.init();

    const prisma = app.get(PrismaService);
    const reviews = app.get(ReviewsService);

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
          title: 'Review Service Test Game',
          description: 'Synthetic integration test record.',
          genres: ['Puzzle'],
        },
      });

      const created = await reviews.save(userId, gameId, {
        rating: 2,
        body: 'First version.',
      });

      const updated = await reviews.save(userId, gameId, {
        rating: 5,
        body: 'Updated version.',
      });

      expect(updated.id).toBe(created.id);
      expect(updated).toMatchObject({
        userId,
        gameId,
        rating: 5,
        body: 'Updated version.',
      });

      expect(
        await prisma.review.count({ where: { userId, gameId } }),
      ).toBe(1);

      expect(
        await prisma.review.findUniqueOrThrow({
          where: { userId_gameId: { userId, gameId } },
        }),
      ).toMatchObject({
        id: created.id,
        rating: 5,
        body: 'Updated version.',
      });

      await expect(
        reviews.save(randomUUID(), gameId, {
          rating: 3,
          body: 'Missing user test.',
        }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid or missing token',
      });

      await expect(
        reviews.save(userId, randomUUID(), {
          rating: 3,
          body: 'Missing game test.',
        }),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Game not found',
      });

      expect(
        await prisma.review.count({ where: { userId, gameId } }),
      ).toBe(1);

      await prisma.user.create({
        data: {
          id: secondUserId,
          email: `${secondUserId}@example.test`,
          passwordHash: 'test-placeholder-not-a-valid-password-hash',
        },
      });

      const secondReview = await reviews.save(secondUserId, gameId, {
        rating: 4,
        body: 'Second user review.',
      });

      expect(secondReview.id).not.toBe(created.id);

      await reviews.save(userId, gameId, {
        rating: 3,
        body: 'First user changed their own review.',
      });

      expect(
        await prisma.review.findUniqueOrThrow({
          where: { id: secondReview.id },
        }),
      ).toMatchObject({
        userId: secondUserId,
        gameId,
        rating: 4,
        body: 'Second user review.',
      });

      expect(
        await prisma.review.count({
          where: { gameId, userId: { in: [userId, secondUserId] } },
        }),
      ).toBe(2);

      try {
        execFileSync(
          'docker',
          ['compose', '--profile', 'test', 'stop', 'db-test'],
          { stdio: 'inherit' },
        );

        await expect(
          reviews.save(userId, gameId, {
            rating: 3,
            body: 'Database outage test.',
          }),
        ).rejects.toMatchObject({
          status: 503,
          message: 'Database unavailable',
        });
      } finally {
        execFileSync('npm', ['run', 'test:db:prepare'], {
          stdio: 'inherit',
        });
      }

      await expect(
        reviews.save(userId, gameId, {
          rating: 3,
          body: 'Database recovery test.',
        }),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid or missing token',
      });
    } finally {
      await prisma.review.deleteMany({
        where: { userId: { in: [userId, secondUserId] } },
      });
      await prisma.game.deleteMany({ where: { id: gameId } });
      await prisma.user.deleteMany({
        where: { id: { in: [userId, secondUserId] } },
      });
    }
  } finally {
    await app.close();
  }
}, 60_000);
