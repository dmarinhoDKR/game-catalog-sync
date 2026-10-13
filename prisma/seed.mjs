import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const games = JSON.parse(
    await readFile(new URL('./fixtures/games.json', import.meta.url), 'utf-8'),
);

assert.equal(games.length, 3);
assert.equal(new Set(games.map(game => game.id)).size, games.length);

const prisma = new PrismaService();

try {
    const [identity] = await prisma.$queryRaw`
      SELECT current_user AS username, current_database() AS database
  `;

  assert.equal(identity.username, 'game_catalog_app');
  assert.equal(identity.database, 'game_catalog');

  await prisma.$transaction(
    games.map(game =>
        prisma.game.upsert({
            where: { id: game.id },
            create: game,
            update: {},
        }),
    ),
  );

  const count = await prisma.game.count({
    where: { id: { in: games.map(game => game.id) } },
  });

  assert.equal(count, games.length);
  console.log(`Seeded verificado: ${count} jogos da fixture presentes`);
} finally {
    await prisma.$disconnect();
}
