// Executed only by the official Mongo image on a new database; credentials stay in env.
const database = process.env.MONGO_ARCHIVE_DATABASE;
const username = process.env.MONGO_ARCHIVE_USERNAME;
const password = process.env.MONGO_ARCHIVE_PASSWORD;
if (
  !['game_catalog_sources', 'game_catalog_sources_test'].includes(database) ||
  !['source_archive_app', 'source_archive_test_app'].includes(username) ||
  !/^[a-f0-9]{64}$/.test(password ?? '')
) {
  throw new Error('Invalid Mongo archive initialization');
}
db.getSiblingDB(database).createUser({
  user: username,
  pwd: password,
  roles: [{ role: 'readWrite', db: database }],
});
