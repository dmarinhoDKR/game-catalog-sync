import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service.js';
import { hashPassword } from '../src/auth/password-hash.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { execFileSync } from 'node:child_process';

it('autentica sem expor hash e rejeita credenciais inválidas', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AuthModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const id = randomUUID();
  const email = `${id}@example.test`;
  const password = ' Synthetic integration password ';

  try {
    await app.init();

    const prisma = app.get(PrismaService);
    const auth = app.get(AuthService);

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

      expect(
        await auth.authenticate({
          email: ` ${email.toUpperCase()} `,
          password,
        }),
      ).toEqual({
        id,
        email,
        role: 'USER',
      });

      for (const input of [
        { email, password: password.trim() },
        { email: `${randomUUID()}@example.test`, password },
      ]) {
        await expect(auth.authenticate(input)).rejects.toMatchObject({
          status: 401,
          message: 'Invalid credentials',
        });
      }

      await Promise.all([
        expect(
            auth.authenticate({ email, password }),
        ).resolves.toEqual({
          id,
          email,
          role: 'USER',
        }),
        expect(
          auth.authenticate({ email, password }),
        ).rejects.toMatchObject({
          status: 429,
          message: 'Authentication busy; try again later',
        }),
      ]);

      expect(
        await auth.authenticate({ email, password }),
      ).toEqual({
        id,
        email,
        role: 'USER',
      });

      const result = await auth.signIn({ email, password });

      const claims = await app.get(JwtService).verifyAsync<{
        sub: string;
        role: string;
        iat: number;
        exp: number;
        iss: string;
        aud: string;
      }>(result.access_token);

      expect(claims).toEqual({
        sub: id,
        role: 'USER',
        iat: expect.any(Number),
        exp: expect.any(Number),
        iss: 'game-catalog-sync',
        aud: 'game-catalog-api',
      });

      expect(claims.exp - claims.iat).toBe(900);

      const jwt = app.get(JwtService);

      await expect(
        jwt.verifyAsync(result.access_token, {
          clockTimestamp: claims.exp,
        }),
      ).rejects.toMatchObject({
        name: 'TokenExpiredError',
      });

      const [header, payload, signature] = result.access_token.split('.');
      const changedSignature =
        (signature.startsWith('a') ? 'b' : 'a') + signature.slice(1);

      await expect(
        jwt.verifyAsync(`${header}.${payload}.${changedSignature}`),
      ).rejects.toMatchObject({
        name: 'JsonWebTokenError',
        message: 'invalid signature',
      });
    } finally {
      await prisma.user.deleteMany({ where: { id } });
    }
  } finally {
    await app.close();
  }
});

it('autenticação retorna 503 sem banco e recupera após restauração', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AuthModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  try {
    await app.init();

    const prisma = app.get(PrismaService);
    const auth = app.get(AuthService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    const input = {
      email: `${randomUUID()}@example.test`,
      password: 'Synthetic integration password',
    };

    try {
      execFileSync(
        'docker',
        ['compose', '--profile', 'test', 'stop', 'db-test'],
        { stdio: 'inherit' },
      );

      await expect(auth.authenticate(input)).rejects.toMatchObject({
        status: 503,
        message: 'Database unavailable',
      });
    } finally {
      execFileSync('npm', ['run', 'test:db:prepare'], {
        stdio: 'inherit',
      });
    }

    await expect(auth.authenticate(input)).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
  } finally {
    await app.close();
  }
}, 60_000);
