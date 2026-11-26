const LIVE_TEST_EVENT_KEY = "mobilesasa-live-test:single-send-v1";
const LIVE_TEST_MESSAGE = "HemoConnect MobileSasa live test. No action is required.";
const LIVE_TEST_CONFIRMATION = (phone) => `SEND ONE TEST SMS TO ${phone}`;
const KENYAN_E164_PHONE = /^\+254[17]\d{8}$/;

class SmsLiveTestError extends Error {
  constructor(message) {
    super(message);
    this.name = "SmsLiveTestError";
  }
}

const validateLiveTestConfiguration = (config) => {
  if (config.MOBILESASA_LIVE_TEST_ENABLED !== "true") {
    throw new SmsLiveTestError("Live SMS testing is disabled. Explicitly enable MOBILESASA_LIVE_TEST_ENABLED to continue.");
  }
  if (typeof config.MOBILESASA_LIVE_TEST_RECIPIENT !== "string" ||
      !KENYAN_E164_PHONE.test(config.MOBILESASA_LIVE_TEST_RECIPIENT)) {
    throw new SmsLiveTestError("MOBILESASA_LIVE_TEST_RECIPIENT must contain exactly one Kenyan E.164 number (+254 followed by 9 digits).");
  }
  if (config.SMS_PROVIDER !== "mobilesasa") {
    throw new SmsLiveTestError("SMS_PROVIDER must be mobilesasa for the live test.");
  }
  if (!config.MOBILESASA_API_TOKEN || !config.MOBILESASA_API_TOKEN.trim() ||
      !config.MOBILESASA_SENDER_ID || !config.MOBILESASA_SENDER_ID.trim()) {
    throw new SmsLiveTestError("MobileSasa API token and sender ID must be configured in the local environment.");
  }
};

const runSmsLiveTest = async ({
  config,
  prisma,
  enqueueSmsOnce,
  createProvider,
  confirm,
}) => {
  validateLiveTestConfiguration(config);
  const recipientPhone = config.MOBILESASA_LIVE_TEST_RECIPIENT;
  const existing = await prisma.smsOutbox.findUnique({
    where: { eventKey: LIVE_TEST_EVENT_KEY },
  });
  if (existing) {
    throw new SmsLiveTestError(
      `The one-time live-test record already exists with status ${existing.status}; refusing another send.`
    );
  }

  if (typeof confirm !== "function" ||
      await confirm(recipientPhone, LIVE_TEST_CONFIRMATION(recipientPhone)) !== true) {
    throw new SmsLiveTestError("Live SMS test was not confirmed; no test message was queued.");
  }

  const provider = createProvider(config);
  const queued = await prisma.$transaction((tx) =>
    enqueueSmsOnce(tx, recipientPhone, LIVE_TEST_MESSAGE, LIVE_TEST_EVENT_KEY)
  );
  if (!queued?.created || !queued.sms ||
      queued.sms.eventKey !== LIVE_TEST_EVENT_KEY ||
      queued.sms.recipientPhone !== recipientPhone ||
      queued.sms.message !== LIVE_TEST_MESSAGE ||
      queued.sms.status !== "QUEUED" ||
      queued.sms.attempts !== 0 ||
      !queued.sms.trackingId) {
    throw new SmsLiveTestError("Could not create a new isolated live-test record; refusing to send.");
  }

  const claimed = await prisma.smsOutbox.updateMany({
    where: {
      smsId: queued.sms.smsId,
      eventKey: LIVE_TEST_EVENT_KEY,
      recipientPhone,
      status: "QUEUED",
      attempts: 0,
    },
    data: {
      status: "PROCESSING",
      attempts: 1,
      processingAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new SmsLiveTestError("Could not exclusively claim the isolated test record; refusing to send.");
  }

  const readResult = async () => {
    const record = await prisma.smsOutbox.findUnique({
      where: { eventKey: LIVE_TEST_EVENT_KEY },
      select: { status: true, trackingId: true, providerMessageId: true },
    });
    if (!record) throw new SmsLiveTestError("The live-test outbox record could not be read after the provider attempt.");
    return {
      status: record.status,
      trackingId: record.trackingId,
      providerMessageId: record.providerMessageId,
    };
  };

  let providerResult;
  try {
    providerResult = await provider.send({
      phone: queued.sms.recipientPhone,
      message: LIVE_TEST_MESSAGE,
      trackingId: queued.sms.trackingId,
    });
  } catch {
    await prisma.smsOutbox.updateMany({
      where: { smsId: queued.sms.smsId, status: "PROCESSING" },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        processingAt: null,
        lastError: "The one-time live-test provider attempt failed. Automatic retry is disabled.",
      },
    });
    return readResult();
  }

  await prisma.smsOutbox.updateMany({
    where: { smsId: queued.sms.smsId, status: "PROCESSING" },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      providerMessageId: providerResult?.providerMessageId || null,
      processingAt: null,
      lastError: null,
    },
  });
  return readResult();
};

module.exports = {
  LIVE_TEST_EVENT_KEY,
  LIVE_TEST_MESSAGE,
  LIVE_TEST_CONFIRMATION,
  SmsLiveTestError,
  validateLiveTestConfiguration,
  runSmsLiveTest,
};
