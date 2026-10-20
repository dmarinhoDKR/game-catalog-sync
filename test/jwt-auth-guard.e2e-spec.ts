import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AuthModule } from '../src/auth/auth.module.js';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import type {
  AuthenticatedRequest,
} from '../src/auth/jwt-auth.guard.js';

@Controller('guard-probe')
class TestProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard)
  protectedRoute(@Req() request: AuthenticatedRequest) {
    return request.auth;
  }
}

it('aceita Bearer válido e rejeita token ausente, expirado ou adulterado', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AuthModule],
    controllers: [TestProtectedController],
  }).compile();

  const app = moduleFixture.createNestApplication();

  try {
    await app.init();

    const jwt = app.get(JwtService);
    const userId = randomUUID();
    const token = await jwt.signAsync({
      sub: userId,
      role: 'USER',
    });

    await request(app.getHttpServer())
      .get('/guard-probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ userId, role: 'USER' });

    const expired = await jwt.signAsync(
      { sub: userId, role: 'USER' },
      { expiresIn: -1 },
    );

    const [header, payload, signature] = token.split('.');
    const changedSignature =
      (signature.startsWith('a') ? 'b' : 'a') + signature.slice(1);

    const rejectedTokens = await Promise.all([
      jwt.signAsync({ sub: 'invalid-id', role: 'USER' }),
      jwt.signAsync({ sub: userId, role: 'OWNER' }),
      jwt.signAsync(
        { sub: userId, role: 'USER' },
        { issuer: 'other-issuer' },
      ),
      jwt.signAsync(
        { sub: userId, role: 'USER' },
        { audience: 'other-api' },
      ),
      jwt.signAsync(
        { sub: userId, role: 'USER' },
        { algorithm: 'HS384' },
      ),
    ]);

    for (const authorization of [
      undefined,
      'Bearer',
      'Basic invalid',
      'Bearer invalid-token',
      `Bearer ${expired}`,
      `Bearer ${header}.${payload}.${changedSignature}`,
      ...rejectedTokens.map(value => `Bearer ${value}`),
    ]) {
      const call = request(app.getHttpServer()).get('/guard-probe');

      if (authorization !== undefined) {
        call.set('Authorization', authorization);
      }

      const response = await call.expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid or missing token',
      });
    }
  } finally {
    await app.close();
  }
});
