import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminGuard } from '../src/auth/admin.guard.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Controller('admin-probe')
class TestAdminController {
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  protectedRoute() {
    return { status: 'allowed' };
  }
}

it('exige autenticação e papel ADMIN atual no banco', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AuthModule],
    controllers: [TestAdminController],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const userId = randomUUID();
  const adminId = randomUUID();

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
        data: [
          {
            id: userId,
            email: `${userId}@example.test`,
            passwordHash: 'test-placeholder-not-a-valid-password-hash',
          },
          {
            id: adminId,
            email: `${adminId}@example.test`,
            passwordHash: 'test-placeholder-not-a-valid-password-hash',
            role: 'ADMIN',
          },
        ],
      });

      await request(app.getHttpServer())
        .get('/admin-probe')
        .expect(401);

      // Claim ADMIN não concede acesso se o banco registra USER.
      const userToken = await jwt.signAsync({
        sub: userId,
        role: 'ADMIN',
      });

      const denied = await request(app.getHttpServer())
        .get('/admin-probe')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(denied.body).toMatchObject({
        statusCode: 403,
        message: 'Administrator access required',
      });

      const adminToken = await jwt.signAsync({
        sub: adminId,
        role: 'ADMIN',
      });

      await request(app.getHttpServer())
        .get('/admin-probe')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect({ status: 'allowed' });

      await prisma.user.update({
        where: { id: adminId },
        data: { role: 'USER' },
      });

      await request(app.getHttpServer())
        .get('/admin-probe')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      await prisma.user.delete({
        where: { id: adminId },
      });

      const removed = await request(app.getHttpServer())
        .get('/admin-probe')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);

      expect(removed.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid or missing token',
      });

      try {
        execFileSync(
          'docker',
          ['compose', '--profile', 'test', 'stop', 'db-test'],
          { stdio: 'inherit' },
        );

        const unavailable = await request(app.getHttpServer())
          .get('/admin-probe')
          .set('Authorization', `Bearer ${adminToken}`)
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

      await request(app.getHttpServer())
        .get('/admin-probe')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [userId, adminId] } },
      });
    }
  } finally {
    await app.close();
  }
}, 60_000);
