import { randomBytes } from 'node:crypto';
import { readFileSync, appendFileSync, chmodSync } from 'node:fs';
import { parse } from 'dotenv';
const existing = parse(readFileSync('.env'));
const root = randomBytes(32).toString('hex');
const app = randomBytes(32).toString('hex');
const values = {
  MONGO_ROOT_PASSWORD: root,
  MONGO_APP_PASSWORD: app,
  MONGODB_URI: `mongodb://source_archive_app:${app}@127.0.0.1:27018/game_catalog_sources?authSource=game_catalog_sources`,
};
if (Object.keys(values).some((key) => Object.hasOwn(existing, key))) {
  throw new Error('Mongo configuration already exists; no values changed.');
}
chmodSync('.env', 0o600);
appendFileSync(
  '.env',
  '\n' +
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') +
    '\n',
);
console.log('Local Mongo configuration added; secrets not displayed.');
