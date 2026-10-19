import { Controller, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';

@Controller('rate-limit-probe')
class TestLoginController {
  @Post('login')
  @UseGuards(ThrottlerGuard)
  login() {
    return { status: 'test-only' };
  }
}

it('permite cinco requisições e bloqueia a sexta com 429', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AuthModule],
    controllers: [TestLoginController],
  }).compile();

  const app = moduleFixture.createNestApplication();

  try {
    await app.init();

    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app.getHttpServer())
        .post('/rate-limit-probe/login')
        .expect(201)
        .expect({ status: 'test-only' });
    }

    const response = await request(app.getHttpServer())
      .post('/rate-limit-probe/login')
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
    });

    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
