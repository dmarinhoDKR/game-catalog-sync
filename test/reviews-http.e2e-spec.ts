import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReviewsModule } from '../src/reviews/reviews.module.js';
import { execFileSync } from 'node:child_process';

it('PUT exige token e mantém avaliações isoladas por usuário', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [ReviewsModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const gameId = randomUUID();
  const userIds = [userId, secondUserId];

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
          title: 'Review HTTP Test Game',
          description: 'Synthetic HTTP test record.',
          genres: ['Puzzle'],
        },
      });

      const token = await jwt.signAsync({
        sub: userId,
        role: 'USER',
      });

      const secondToken = await jwt.signAsync({
        sub: secondUserId,
        role: 'USER',
      });

      const path = `/games/${gameId}/review`;

      await request(app.getHttpServer())
        .put(path)
        .send({ rating: 3, body: 'Without authentication.' })
        .expect(401);

      await request(app.getHttpServer())
        .put('/games/invalid-uuid/review')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 3, body: 'Invalid game ID.' })
        .expect(400);

      await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 6, body: 'Invalid rating.' })
        .expect(400);

      await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .send({
          userId: secondUserId,
          rating: 1,
          body: 'Attempt to choose another user.',
        })
        .expect(400);

      expect(
        await prisma.review.count({
          where: { gameId, userId: { in: userIds } },
        }),
      ).toBe(0);

      const created = await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 2, body: ' First user review. ' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(created.body).toMatchObject({
        userId,
        gameId,
        rating: 2,
        body: 'First user review.',
      });

      await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ rating: 4, body: 'Second user review.' })
        .expect(200);

      const firstReview = await prisma.review.findUniqueOrThrow({
        where: { userId_gameId: { userId, gameId } },
      });

      const updated = await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, body: 'First user updated.' })
        .expect(200);

      expect(updated.body).toMatchObject({
        id: firstReview.id,
        userId,
        gameId,
        rating: 5,
        body: 'First user updated.',
      });

      expect(
        await prisma.review.findUniqueOrThrow({
          where: {
            userId_gameId: { userId: secondUserId, gameId },
          },
        }),
      ).toMatchObject({
        rating: 4,
        body: 'Second user review.',
      });

      expect(
        await prisma.review.count({
          where: { gameId, userId: { in: userIds } },
        }),
      ).toBe(2);

      const missingGame = await request(app.getHttpServer())
        .put(`/games/${randomUUID()}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 3, body: 'Missing game test.' })
        .expect(404);

      expect(missingGame.body).toMatchObject({
        statusCode: 404,
        message: 'Game not found',
      });

      await prisma.review.deleteMany({
        where: { userId: secondUserId, gameId },
      });

      await prisma.user.delete({
        where: { id: secondUserId },
      });

      const removedUser = await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ rating: 3, body: 'Removed user test.' })
        .expect(401);

      expect(removedUser.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid or missing token',
      });

      expect(
        await prisma.review.findUniqueOrThrow({
          where: { userId_gameId: { userId, gameId } },
        }),
      ).toMatchObject({
        rating: 5,
        body: 'First user updated.',
      });

      try {
        execFileSync(
          'docker',
          ['compose', '--profile', 'test', 'stop', 'db-test'],
          { stdio: 'inherit' },
        );

        const unavailable = await request(app.getHttpServer())
          .put(path)
          .set('Authorization', `Bearer ${token}`)
          .send({ rating: 3, body: 'Database outage test.' })
          .expect(503)

        expect(unavailable.body).toMatchObject({
          statusCode: 503,
          message: 'Database unavailable',
        });
      } finally {
        execFileSync('npm', ['run', 'test:db:prepare'], {
          stdio: 'inherit',
        });
      }

      // A reconstrução descartou os registros temporários do teste.
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
          title: 'Recovered Review Test Game',
          description: 'Synthetic recovery test record.',
          genres: ['Puzzle'],
        },
      });

      const recovered = await request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 4, body: 'Saved after recovery.' })
        .expect(200);

      expect(recovered.body).toMatchObject({
        userId,
        gameId,
        rating: 4,
        body: 'Saved after recovery.',
      });

      expect(
        await prisma.review.findUniqueOrThrow({
          where: { userId_gameId: { userId, gameId } },
        }),
      ).toMatchObject({
        rating: 4,
        body: 'Saved after recovery.',
      });
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
