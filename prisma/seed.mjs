import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { normalizeEmail } from '../dist/auth/normalize-email.js';
import { hashPassword, verifyPassword } from '../dist/auth/password-hash.js';

const games = JSON.parse(
    await readFile(new URL('./fixtures/games.json', import.meta.url), 'utf-8'),
);

assert.equal(games.length, 3);
assert.equal(new Set(games.map(game => game.id)).size, games.length);

const users = JSON.parse(
    await readFile(new URL('./fixtures/users.json', import.meta.url), 'utf-8'),
).map(user => ({
  ...user,
  email: normalizeEmail(user.email),
}));

assert.equal(users.length, 2);
assert.equal(new Set(users.map(user => user.email)).size, users.length);

assert.deepEqual(users, [
  { email: 'user@example.test', role: 'USER' },
  { email: 'admin@example.test', role: 'ADMIN' },
]);

const demoPasswords = [
    process.env.DEMO_USER_PASSWORD,
    process.env.DEMO_ADMIN_PASSWORD,
];

for (const password of demoPasswords) {
    assert.equal(typeof password, 'string', 'Senha de demonstração ausente');

    assert.ok(
        password.length >= 15 &&
          Buffer.byteLength(password, 'utf8') <= 1024,
        'Senha de demonstração deve ter pelo menos 15 caracteres e até 1024 bytes',
    );
}

assert.notEqual(
    demoPasswords[0],
    demoPasswords[1],
    'Use senhas diferentes para os usuários de demonstração',
);

const prisma = new PrismaService();

try {
    const [identity] = await prisma.$queryRaw`
      SELECT current_user AS username, current_database() AS database
  `;

  assert.equal(identity.username, 'game_catalog_app');
  assert.equal(identity.database, 'game_catalog');

  const usersWithHashes = [];

  for (const [index, user] of users.entries()) {
    usersWithHashes.push({
      ...user,
      passwordHash: await hashPassword(demoPasswords[index]),
    });
  }

  await prisma.$transaction([
    ...games.map(game =>
        prisma.game.upsert({
          where: { id: game.id },
          create: game,
          update: {},
        }),
    ),
    ...usersWithHashes.map(user =>
        prisma.user.upsert({
          where: { email: user.email },
          create: user,
          update: {},
        }),
    ),
  ]);

  const count = await prisma.game.count({
    where: { id: { in: games.map(game => game.id) } },
  });

  assert.equal(count, games.length);

  for (const [index, expected] of users.entries()) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: expected.email },
    });

    assert.equal(user.role, expected.role, 'Papel de demonstração divergente');

    assert.ok(
      await verifyPassword(demoPasswords[index], user.passwordHash),
      'Senha de demonstração não corresponde ao hash persistido',
    );
  }

  console.log(`Usuários de demonstração verificados: ${users.length}`);
  console.log(`Seeded verificado: ${count} jogos da fixture presentes`);
} finally {
    await prisma.$disconnect();
}
