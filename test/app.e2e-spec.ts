import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { execFileSync } from 'node:child_process';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health/live (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/games/:id retorna o jogo persistido', async () => {
    const prisma = app.get(PrismaService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    const id = randomUUID();

    try {
      await prisma.game.create({
        data: {
          id,
          title: 'HTTP Test Game',
          description: 'Exclusive integration test record.',
          genres: ['Puzzle'],
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/games/${id}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        id,
        title: 'HTTP Test Game',
        description: 'Exclusive integration test record.',
        genres: ['Puzzle'],
        updatedAt: expect.any(String),
      });
    } finally {
      await prisma.game.deleteMany({ where: { id } });
    }
  });

  it('/games/:id rejeita UUID inválido', async () => {
    const response = await request(app.getHttpServer())
      .get('/games/invalid-uuid')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });

  it('/games/: id retorna 404 para jogo ausente', async () => {
    const id = randomUUID();
    const prisma = app.get(PrismaService);

    expect(await prisma.game.findUnique({ where: { id } })).toBeNull();

    const response = await request(app.getHttpServer())
      .get(`/games/${id}`)
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Game not found',
    });
  });

  it('retorna 503 sem banco e recupera após restauração', async () => {
    const prisma = app.get(PrismaService);

    const [identity] = await prisma.$queryRaw<
      { username: string; database: string }[]
    >`SELECT current_user AS username, current_database() AS database`;

    assert.equal(identity.username, 'game_catalog_test_app');
    assert.equal(identity.database, 'game_catalog_test');

    try {
      execFileSync(
        'docker',
        ['compose', '--profile', 'test', 'stop', 'db-test'],
        { stdio: 'inherit' }
      );

      await request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect({ status: 'ok' });

      for (const path of ['/health/ready', `/games/${randomUUID()}`]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .expect(503);

        expect(response.body).toMatchObject({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database unavailable',
        });
      }
    } finally {
      execFileSync('npm', ['run', 'test:db:prepare'], {
        stdio: 'inherit',
      });
    }

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok' });

    await request(app.getHttpServer())
      .get(`/games/${randomUUID()}`)
      .expect(404);
  }, 60_000);

  afterEach(async () => {
    await app.close();
  });
});
