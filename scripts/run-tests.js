const path = require("path");
const { spawnSync } = require("child_process");
const { loadTestDatabase } = require("./test-db-safety");

try {
  const { databaseName } = loadTestDatabase();
  console.log(`Running server tests against ${databaseName}.`);

  const jestPath = path.resolve(__dirname, "..", "node_modules", "jest", "bin", "jest.js");
  const result = spawnSync(
    process.execPath,
    [jestPath, "--runInBand", "server/tests"],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DOTENV_CONFIG_QUIET: "true" },
      stdio: "inherit",
    }
  );

  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
