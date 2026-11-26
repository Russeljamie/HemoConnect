const path = require("path");
const { spawnSync } = require("child_process");
const { loadTestDatabase, verifyTestDatabaseExists } = require("./test-db-safety");

function runCommand(label, executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (label === "Seed") {
    if (result.status === 0) console.log("Seed completed successfully.");
    else console.error("Seed failed; seed output suppressed to avoid printing seeded credentials.");
  } else if (output) {
    const safeOutput = output.replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi,
      "$1[redacted]@"
    );
    process.stdout.write(safeOutput);
  }

  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

async function main() {
  try {
    const testDatabase = loadTestDatabase();
    const { databaseName } = testDatabase;
    await verifyTestDatabaseExists(testDatabase);
    console.log(`Preparing test database ${databaseName}.`);

    const prismaCli = path.resolve(
      __dirname,
      "..",
      "node_modules",
      "prisma",
      "build",
      "index.js"
    );
    runCommand("Prisma migrate deploy", process.execPath, [prismaCli, "migrate", "deploy"]);
    runCommand("Seed", process.execPath, [path.resolve(__dirname, "..", "prisma", "seed.js")]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
