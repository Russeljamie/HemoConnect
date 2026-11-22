const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const dotenv = require("dotenv");

const rootDirectory = path.resolve(__dirname, "..");
const requiredDatabaseName = "hemoconnect_test";
const allowedHosts = new Set(["localhost", "127.0.0.1"]);

function parseDatabaseUrl(value, label) {
  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${label} DATABASE_URL must be a valid PostgreSQL URL; connection details were suppressed.`);
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error(`${label} DATABASE_URL must use PostgreSQL; connection details were suppressed.`);
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error(`${label} DATABASE_URL has an invalid database name; connection details were suppressed.`);
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!databaseName) {
    throw new Error(`${label} database name is missing on host "${host}".`);
  }

  return { databaseName, host };
}

function validateTestDatabaseUrls(testDatabaseUrl, developmentDatabaseUrl) {
  const testDatabase = parseDatabaseUrl(testDatabaseUrl, "Test");
  const developmentDatabase = parseDatabaseUrl(developmentDatabaseUrl, "Development");

  if (testDatabase.databaseName !== requiredDatabaseName) {
    throw new Error(
      `Refusing to continue: test database "${testDatabase.databaseName}" on host "${testDatabase.host}" must be "${requiredDatabaseName}".`
    );
  }

  if (!allowedHosts.has(testDatabase.host)) {
    throw new Error(
      `Refusing to continue: test database "${testDatabase.databaseName}" uses non-local host "${testDatabase.host}".`
    );
  }

  if (testDatabase.databaseName.toLowerCase() === developmentDatabase.databaseName.toLowerCase()) {
    throw new Error(
      `Refusing to continue: test database "${testDatabase.databaseName}" on host "${testDatabase.host}" matches development database "${developmentDatabase.databaseName}" on host "${developmentDatabase.host}".`
    );
  }

  return testDatabase;
}

function readDevelopmentDatabaseUrl() {
  let developmentEnvironment;
  try {
    const developmentEnvironmentPath = path.join(rootDirectory, ".env");
    developmentEnvironment = dotenv.parse(fs.readFileSync(developmentEnvironmentPath));
  } catch {
    throw new Error("Cannot read the development .env DATABASE_URL; no database operation was run.");
  }

  if (!developmentEnvironment.DATABASE_URL) {
    throw new Error("The development .env must define DATABASE_URL; no database operation was run.");
  }

  return developmentEnvironment.DATABASE_URL;
}

function loadTestDatabase(options = {}) {
  const environmentFile = options.environmentFile
    || process.env.HEMOCONNECT_TEST_ENV_FILE
    || path.join(rootDirectory, ".env.test");

  const loaded = dotenv.config({
    path: environmentFile,
    override: true,
    quiet: true,
  });
  if (loaded.error) {
    throw new Error("Cannot load the test environment file. Create .env.test before running tests.");
  }

  return validateTestDatabaseUrls(
    process.env.DATABASE_URL,
    readDevelopmentDatabaseUrl()
  );
}

async function verifyTestDatabaseExists({ databaseName, host }) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;

  try {
    await client.connect();
    connected = true;
  } catch (error) {
    if (error && error.code === "3D000") {
      throw new Error(
        `Test database "${databaseName}" on host "${host}" does not exist. Create it manually; no database was created.`
      );
    }

    throw new Error(
      `Cannot connect to test database "${databaseName}" on host "${host}"; connection details were suppressed.`
    );
  } finally {
    if (connected) await client.end();
  }
}

if (require.main === module) {
  try {
    const { databaseName } = loadTestDatabase();
    if (process.argv.includes("--print-database")) {
      console.log(databaseName);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  loadTestDatabase,
  validateTestDatabaseUrls,
  verifyTestDatabaseExists,
};
