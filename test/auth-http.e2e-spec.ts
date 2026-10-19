import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { hashPassword } from '../src/auth/password-hash.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

it('login HTTP valida entrada, autentica e limita requisições', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AuthModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const id = randomUUID();
  const email = `${id}@example.test`;
  const password = ' Synthetic HTTP password ';

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
          id,
          email,
          passwordHash: await hashPassword(password),
        },
      });

      // Primeira requisição: entrada inválida.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password, role: 'ADMIN' })
        .expect(400);

      // Segunda requisição: senha incorreta.
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: password.trim() })
        .expect(401);

      // Terceira requisição: email ausente.
      const missingUser = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `${randomUUID()}@example.test`,
          password,
        })
        .expect(401);

      expect(wrongPassword.body).toEqual(missingUser.body);
      expect(wrongPassword.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid credentials',
      });

      // Quarta requisição: login válido.
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ` ${email.toUpperCase()} `, password })
        .expect('Content-Type', /json/)
        .expect('Cache-Control', 'no-store')
        .expect(200);

      const body: unknown = response.body;

      assert.ok(typeof body === 'object' && body !== null);
      assert.ok('access_token' in body);
      assert.ok(typeof body.access_token === 'string');
      expect(Object.keys(body)).toEqual(['access_token']);

      const claims = await app.get(JwtService).verifyAsync<{
        sub: string;
        role: string;
      }>(body.access_token);

      expect(claims.sub).toBe(id);
      expect(claims.role).toBe('USER');

      // Quinta requisição: ainda permitida.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);

      // Sexta requisição: bloqueada antes da autenticação.
      const blocked = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(429);

      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await prisma.user.deleteMany({ where: { id } });
    }
  } finally {
    await app.close();
  }
});