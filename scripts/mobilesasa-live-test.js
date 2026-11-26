const env = require("../server/config/env");
const { validateLiveTestConfiguration, runSmsLiveTest } = require("../server/services/smsLiveTest");
const { loadTestDatabase, verifyTestDatabaseExists } = require("./test-db-safety");

const askForConfirmation = (recipientPhone, confirmationText) => {
  const readline = require("readline");
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log(`One-time HemoConnect MobileSasa test recipient: ${recipientPhone}`);
  return new Promise((resolve) => {
    let completed = false;
    const finish = (confirmed) => {
      if (completed) return;
      completed = true;
      terminal.close();
      resolve(confirmed);
    };
    terminal.once("close", () => finish(false));
    terminal.question(`Type "${confirmationText}" to send one test SMS: `, (answer) =>
      finish(answer === confirmationText)
    );
  });
};

const executeLiveSmsTest = async (dependencies = {}) => {
  const config = dependencies.config || env;
  validateLiveTestConfiguration(config);

  const safety = dependencies.safety || { loadTestDatabase, verifyTestDatabaseExists };
  const target = safety.loadTestDatabase();
  await safety.verifyTestDatabaseExists(target);

  const prisma = dependencies.prisma || require("../server/services/prisma");
  const sms = dependencies.sms || require("../server/services/sms");
  const enqueueSmsOnce = dependencies.enqueueSmsOnce || sms.enqueueSmsOnce;
  const createProvider = dependencies.createProvider || ((settings) =>
    sms.createMobileSasaProvider({
      token: settings.MOBILESASA_API_TOKEN,
      senderId: settings.MOBILESASA_SENDER_ID,
      endpoint: settings.MOBILESASA_API_URL,
      callbackUrl: settings.SMS_DELIVERY_REPORT_URL,
    }));

  try {
    const result = await runSmsLiveTest({
      config,
      prisma,
      enqueueSmsOnce,
      createProvider,
      confirm: dependencies.confirm || askForConfirmation,
    });
    return result;
  } finally {
    if (!dependencies.prisma && prisma) await prisma.$disconnect();
  }
};

const main = async () => {
  try {
    if (process.argv.length > 2) {
      throw new Error("This one-time command accepts no command-line options or credentials.");
    }
    const result = await executeLiveSmsTest();
    console.log(
      `Live-test outbox status: ${result.status}; tracking ID: ${result.trackingId}; provider message ID: ${result.providerMessageId || "not supplied"}`
    );
    if (!["ACCEPTED", "DELIVERED"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    if (error?.name === "SmsLiveTestError" ||
        error?.message === "This one-time command accepts no command-line options or credentials." ||
        error?.message?.startsWith("Refusing to continue:") ||
        error?.message?.startsWith("Cannot ")) {
      console.error(error.message);
    } else {
      console.error("Live SMS test failed. No credentials or provider response details were printed.");
    }
    process.exitCode = 1;
  }
};

if (require.main === module) main();

module.exports = { executeLiveSmsTest };
