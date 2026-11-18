import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync } from 'node:fs';

// Validate all cleanup/migration targets BEFORE starting Docker or Prisma.
function testPostgres(value, username) {
  const url = new URL(value ?? '');
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5437' ||
    url.pathname !== '/game_catalog_test' ||
    url.searchParams.get('schema') !== 'catalog' ||
    decodeURIComponent(url.username) !== username ||
    !url.password ||
    [...url.searchParams].length !== 1 ||
    !!url.hash
  ) {
    throw new Error('Refusing non-test PostgreSQL target');
  }
}
try {
  testPostgres(process.env.TEST_DATABASE_URL, 'game_catalog_test_app');
  testPostgres(process.env.TEST_MIGRATION_DATABASE_URL, 'postgres');
} catch {
  console.error('Invalid test database configuration; no services started.');
  process.exit(1);
}
const lock = '.documents-test.lock';
let fd;
try {
  fd = openSync(lock, 'wx', 0o600);
} catch {
  console.error(
    'Document test lock exists; check running tests before removing it.',
  );
  process.exit(1);
}
const password = () => randomBytes(32).toString('hex');
const appPassword = password();
const env = {
  ...process.env,
  NODE_ENV: 'test',
  MONGO_TEST_ROOT_PASSWORD: password(),
  MONGO_TEST_APP_PASSWORD: appPassword,
  TEST_MONGODB_URI: `mongodb://source_archive_test_app:${appPassword}@127.0.0.1:27019/game_catalog_sources_test?authSource=game_catalog_sources_test`,
};
const compose = [
  'compose',
  '-f',
  'compose.sources-test.yaml',
  '--profile',
  'test',
];
function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw new Error('Document test command failed');
}
let mongoTouched = false;
try {
  // This is a dedicated, disposable test service. Never down -v or touch mongo/db.
  mongoTouched = true;
  run('docker', [
    ...compose,
    'up',
    '-d',
    '--wait',
    '--force-recreate',
    'mongo-test',
  ]);
  run('npm', ['run', 'test:db:prepare']);
  run('npx', [
    '--no-install',
    'vitest',
    'run',
    '--config',
    'vitest.config.documents.ts',
  ]);
} catch {
  process.exitCode = 1;
} finally {
  if (mongoTouched) {
    const cleanup = spawnSync('docker', [...compose, 'stop', 'mongo-test'], {
      env,
      stdio: 'inherit',
    });
    if (cleanup.error || cleanup.status !== 0) process.exitCode = 1;
  }
  closeSync(fd);
  unlinkSync(lock);
}
