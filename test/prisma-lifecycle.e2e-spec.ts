import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

it('app.close encerra a conexão PostgreSQL do Prisma', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [PrismaModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const observer = new PrismaService();

  try {
    let pid: number;

    try {
      await app.init();

      const prisma = app.get(PrismaService);
      const [identity] = await prisma.$queryRaw<
        { pid: number; username: string; database: string }[]
      >`
        SELECT pg_backend_pid() AS pid,
               current_user AS username,
               current_database() AS database
      `;

      assert.equal(identity.username, 'game_catalog_test_app');
      assert.equal(identity.database, 'game_catalog_test');
      pid = identity.pid;

      const connections = await observer.$queryRaw<{ pid: number }[]>`
        SELECT pid FROM pg_stat_activity WHERE pid = ${pid}
      `;

      expect(connections).toHaveLength(1);
    } finally {
      await app.close();
    }

    const connections = await observer.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity WHERE pid = ${pid}
    `;

    expect(connections).toHaveLength(0);
  } finally {
    await observer.$disconnect();
  }
});
