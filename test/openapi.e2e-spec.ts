import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupOpenApi } from '../src/openapi.js';

it('publica o contrato OpenAPI com paginação e autenticação das avaliações', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  try {
    setupOpenApi(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect('Content-Type', /json/)
      .expect(200);

    const doc = JSON.parse(response.text);

    expect(doc.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    const games = doc.paths['/games'].get;

    expect(games.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        }),
        expect.objectContaining({
          name: 'cursor',
          in: 'query',
          required: false,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        }),
      ]),
    );

    const page = games.responses['200']
      .content['application/json'].schema;

    expect(page.required).toEqual(['items', 'nextCursor']);
    expect(page.properties.nextCursor).toEqual({
      type: 'string',
      format: 'uuid',
      nullable: true,
    });

    const singleGame = doc.paths['/games/{id}'].get.responses['200']
      .content['application/json'].schema;

    expect(singleGame).toEqual(page.properties.items.items);

    const review = doc.paths['/games/{id}/review'];

    for (const operation of [review.put, review.delete]) {
      expect(operation.security).toEqual([{ bearer: [] }]);
    }

    const input = review.put.requestBody
      .content['application/json'].schema;

    expect(input.additionalProperties).toBe(false);
    expect(input.required).toEqual(['rating', 'body']);
    expect(input.properties.rating).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 5,
    });

    assert.ok(review.delete.responses['204']);
    expect(review.delete.responses['204']).not.toHaveProperty('content');

    for (const path of ['/health/live', '/health/ready']) {
      const schema = doc.paths[path].get.responses['200']
        .content['application/json'].schema;

      expect(schema.required).toEqual(['status']);
      expect(schema.properties.status.enum).toEqual(['ok']);
    }

    assert.ok(doc.paths['/health/ready'].get.responses['503']);
  } finally {
    await app.close();
  }
});
