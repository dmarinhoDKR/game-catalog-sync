import { Test } from '@nestjs/testing';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

it ('User aplica papel USER e rejeita email duplicado', async () => {
    const moduleFixture = await Test.createTestingModule({
        imports: [PrismaModule],
    }).compile();

    const app = moduleFixture.createNestApplication();

    try {
        await app.init();
        const prisma = app.get(PrismaService);

        const [identity] = await prisma.$queryRaw<
          { username: string; database: string }[]
        >`SELECT current_user AS username, current_database() AS database`;

        assert.equal(identity.username, 'game_catalog_test_app');
        assert.equal(identity.database, 'game_catalog_test');

        const ids = [randomUUID(), randomUUID()];
        const email = `${ids[0]}@example.test`;

        try {
            const user = await prisma.user.create({
                data: {
                  id: ids[0],
                  email,
                  passwordHash: 'test-placeholder-not-a-valid-password-hash',
                },
            });

            expect(user.role).toBe('USER');

            await expect(
                prisma.user.create({
                    data: {
                      id: ids[1],
                      email,
                      passwordHash: 'test-placeholder-not-a-valid-password-hash',
                    },
                }),
            ).rejects.toMatchObject({ code: 'P2002' });
        } finally {
            await prisma.user.deleteMany({
                where: { id: { in: ids } },
            });
        }
    } finally {
        await app.close();
    }
});
