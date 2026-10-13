import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const connectionString = process.env.TEST_MIGRATION_DATABASE_URL;

if (!connectionString) {
    throw new Error('TEST_MIGRATION_DATABASE_URL não configurada');
}

const url = new URL(connectionString);

if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5437' ||
    url.pathname !== '/game_catalog_test' ||
    url.searchParams.get('schema') !== 'catalog'
) {
    throw new Error('Alvo de migração de testes inválido');
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: connectionString,
    },
});
