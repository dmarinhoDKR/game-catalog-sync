import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReviewsModule } from '../src/reviews/reviews.module.js';
import { execFileSync } from 'node:child_process';

it('DELETE remove somente a própria avaliação e permite repetição', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [ReviewsModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const userIds = [userId, secondUserId];
  const gameId = randomUUID();

  try {
    await app.init();

    const prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    try {
      await prisma.user.createMany({
        data: userIds.map(id => ({
          id,
          email: `${id}@example.test`,
          passwordHash: 'test-placeholder-not-a-valid-password-hash',
        })),
      });

      await prisma.game.create({
        data: {
          id: gameId,
          title: 'Delete Review Test Game',
          description: 'Synthetic HTTP test record.',
          genres: ['Puzzle'],
        },
      });

      await prisma.review.createMany({
        data: userIds.map(id => ({
          userId: id,
          gameId,
          rating: 4,
          body: 'Review to test deletion.',
        })),
      });

      const token = await jwt.signAsync({
        sub: userId,
        role: 'USER',
      });

      const path = `/games/${gameId}/review`;

      await request(app.getHttpServer())
        .delete(path)
        .expect(401);

      await request(app.getHttpServer())
        .delete('/games/invalid-uuid/review')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      // Identidades enviadas pelo cliente não escolhem o proprietário.
      const removed = await request(app.getHttpServer())
        .delete(path)
        .query({ userId: secondUserId })
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: secondUserId })
        .expect(204);

      expect(removed.text).toBe('');

      expect(
        await prisma.review.findUnique({
          where: { userId_gameId: { userId, gameId } },
        }),
      ).toBeNull();

      await request(app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/games/${randomUUID()}/review`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(
        await prisma.review.findUniqueOrThrow({
          where: {
            userId_gameId: { userId: secondUserId, gameId },
          },
        }),
      ).toMatchObject({
        userId: secondUserId,
        gameId,
        rating: 4,
        body: 'Review to test deletion.',
      });

      await prisma.user.delete({ where: { id: userId } });

      await request(app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      try {
        execFileSync(
          'docker',
          ['compose', '--profile', 'test', 'stop', 'db-test'],
          { stdio: 'inherit' },
        );

        const unavailable = await request(app.getHttpServer())
          .delete(path)
          .set('Authorization', `Bearer ${token}`)
          .expect(503);

        expect(unavailable.body).toMatchObject({
          statusCode: 503,
          message: 'Database unavailable',
        });
      } finally {
        execFileSync('npm', ['run', 'test:db:prepare'], {
          stdio: 'inherit',
        });
      }

      // A reconstrução descartou os registros temporários.
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
          title: 'Recovered Delete Test Game',
          description: 'Synthetic recovery test record.',
          genres: ['Puzzle'],
        },
      });

      await prisma.review.create({
        data: {
          userId,
          gameId,
          rating: 4,
          body: 'Review to delete after recovery.',
        },
      });

      const recovered = await request(app.getHttpServer())
        .delete(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(recovered.text).toBe('');

      expect(
        await prisma.review.findUnique({
          where: { userId_gameId: { userId, gameId } },
        }),
      ).toBeNull();
    } finally {
      await prisma.review.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.game.deleteMany({ where: { id: gameId } });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  } finally {
    await app.close();
  }
}, 60_000);
