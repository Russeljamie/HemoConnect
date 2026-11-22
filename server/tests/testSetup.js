const {
  loadTestDatabase,
  verifyTestDatabaseExists,
} = require("../../scripts/test-db-safety");

module.exports = async function verifyTestEnvironment() {
  const testDatabase = loadTestDatabase();
  await verifyTestDatabaseExists(testDatabase);
};
