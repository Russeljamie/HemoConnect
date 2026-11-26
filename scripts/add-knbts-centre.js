require("dotenv").config({ quiet: true });

const { parseDatabaseUrl } = require("./test-db-safety");

function assertDevelopmentSeedAllowed() {
  const { databaseName, host } = parseDatabaseUrl(process.env.DATABASE_URL, "Development");

  if (process.env.HEMOCONNECT_ALLOW_DEV_SEED !== "yes") {
    throw new Error(
      `Refusing to add KNBTS demo accounts to database "${databaseName}" on host "${host}"; set HEMOCONNECT_ALLOW_DEV_SEED=yes to proceed.`
    );
  }

  if (databaseName === "hemoconnect_test") {
    throw new Error(
      `Refusing to run the development-only KNBTS script against test database "${databaseName}" on host "${host}".`
    );
  }

  return { databaseName, host };
}

try {
  assertDevelopmentSeedAllowed();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");
const { ensureKnbtsDemoAccounts, hashDemoPassword } = require("../prisma/knbtsDemoAccounts");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const passwordHash = await hashDemoPassword();
  const { centre, staffProfiles } = await ensureKnbtsDemoAccounts(prisma, passwordHash);
  const staffNames = staffProfiles.map(({ user }) => `${user.firstName} ${user.lastName}`);

  console.log(`KNBTS centre: ${centre.name}`);
  console.log(`KNBTS staff profiles added or matched: ${staffProfiles.length}`);
  console.log(`KNBTS staff: ${staffNames.join(", ")}`);
}

main()
  .catch((error) => {
    const errorCode = error && error.code ? ` (${error.code})` : "";
    console.error(`Unable to add KNBTS demo accounts${errorCode}; details suppressed to protect connection credentials.`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
