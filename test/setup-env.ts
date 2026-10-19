import 'dotenv/config';
import { randomBytes } from 'node:crypto';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
    throw new Error('TEST_DATABASE_URL não configurada');
}

const url = new URL(connectionString);

if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5437' ||
    url.pathname !== '/game_catalog_test' ||
    url.searchParams.get('schema') !== 'catalog' ||
    decodeURIComponent(url.username) !== 'game_catalog_test_app'
) {
    throw new Error('Alvo de testes inválido');
}

process.env.DATABASE_URL = connectionString;
process.env.JWT_SECRET = randomBytes(32).toString('hex');
