const {
  LIVE_TEST_EVENT_KEY,
  LIVE_TEST_MESSAGE,
  LIVE_TEST_CONFIRMATION,
  runSmsLiveTest,
} = require("../services/smsLiveTest");
const { isApprovedSmsEventKey } = require("../services/sms");
const { executeLiveSmsTest } = require("../../scripts/mobilesasa-live-test");

const recipientPhone = "+254712345678";
const config = {
  MOBILESASA_LIVE_TEST_ENABLED: "true",
  MOBILESASA_LIVE_TEST_RECIPIENT: recipientPhone,
  SMS_PROVIDER: "mobilesasa",
  MOBILESASA_API_TOKEN: "mock-token",
  MOBILESASA_SENDER_ID: "MOCK",
};

const createHarness = ({ send = jest.fn().mockResolvedValue({ providerMessageId: "mock-provider-id" }) } = {}) => {
  let record = null;
  const prisma = {
    smsOutbox: {
      findUnique: jest.fn(async () => record && { ...record }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!record || record.smsId !== where.smsId || record.status !== where.status) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      }),
    },
    $transaction: jest.fn(async (callback) => callback({})),
  };
  const enqueueSmsOnce = jest.fn(async (_tx, phone, message, eventKey) => {
    if (record) return { sms: { ...record }, created: false };
    record = {
      smsId: 7,
      recipientPhone: phone,
      message,
      eventKey,
      trackingId: "hc-one-time-test-tracking-id",
      status: "QUEUED",
      attempts: 0,
    };
    return { sms: { ...record }, created: true };
  });
  const createProvider = jest.fn(() => ({ send }));
  const dependencies = {
    config,
    prisma,
    enqueueSmsOnce,
    createProvider,
    confirm: jest.fn(async () => true),
  };
  return { dependencies, prisma, enqueueSmsOnce, createProvider, send, getRecord: () => record };
};

describe("isolated MobileSasa live-test command", () => {
  it("refuses to run when live testing is disabled before database or provider access", async () => {
    const safety = { loadTestDatabase: jest.fn(), verifyTestDatabaseExists: jest.fn() };
    const createProvider = jest.fn();
    await expect(executeLiveSmsTest({
      config: { ...config, MOBILESASA_LIVE_TEST_ENABLED: "false" },
      safety,
      createProvider,
    })).rejects.toThrow("Live SMS testing is disabled");
    expect(safety.loadTestDatabase).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("verifies the isolated test database before using the outbox", async () => {
    const harness = createHarness();
    const target = { databaseName: "hemoconnect_test", host: "localhost" };
    const safety = {
      loadTestDatabase: jest.fn(() => target),
      verifyTestDatabaseExists: jest.fn().mockResolvedValue(undefined),
    };
    await executeLiveSmsTest({
      ...harness.dependencies,
      safety,
    });
    expect(safety.loadTestDatabase).toHaveBeenCalledTimes(1);
    expect(safety.verifyTestDatabaseExists).toHaveBeenCalledWith(target);
    expect(harness.send).toHaveBeenCalledTimes(1);
  });

  it.each(["", "0712345678", "+254712345678,+254722222222", "+255712345678"])(
    "rejects an absent or invalid single E.164 allowlist recipient (%s)",
    async (phone) => {
      const harness = createHarness();
      await expect(runSmsLiveTest({
        ...harness.dependencies,
        config: { ...config, MOBILESASA_LIVE_TEST_RECIPIENT: phone },
      })).rejects.toThrow("MOBILESASA_LIVE_TEST_RECIPIENT");
      expect(harness.prisma.smsOutbox.findUnique).not.toHaveBeenCalled();
      expect(harness.send).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["MOBILESASA_API_TOKEN", ""],
    ["MOBILESASA_SENDER_ID", ""],
  ])("refuses missing MobileSasa credential %s", async (key, value) => {
    const harness = createHarness();
    await expect(runSmsLiveTest({
      ...harness.dependencies,
      config: { ...config, [key]: value },
    })).rejects.toThrow("MobileSasa API token and sender ID");
    expect(harness.prisma.smsOutbox.findUnique).not.toHaveBeenCalled();
    expect(harness.send).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before queueing or creating a provider", async () => {
    const harness = createHarness();
    harness.dependencies.confirm.mockResolvedValue(false);
    await expect(runSmsLiveTest(harness.dependencies)).rejects.toThrow("was not confirmed");
    expect(harness.dependencies.confirm).toHaveBeenCalledWith(
      recipientPhone,
      LIVE_TEST_CONFIRMATION(recipientPhone)
    );
    expect(harness.enqueueSmsOnce).not.toHaveBeenCalled();
    expect(harness.createProvider).not.toHaveBeenCalled();
    expect(harness.send).not.toHaveBeenCalled();
  });

  it("sends one clear test message only to the allowlisted phone and records provider acceptance", async () => {
    const harness = createHarness();
    const result = await runSmsLiveTest(harness.dependencies);
    expect(harness.enqueueSmsOnce).toHaveBeenCalledWith(
      {},
      recipientPhone,
      LIVE_TEST_MESSAGE,
      LIVE_TEST_EVENT_KEY
    );
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      phone: recipientPhone,
      message: LIVE_TEST_MESSAGE,
      trackingId: "hc-one-time-test-tracking-id",
    });
    expect(harness.prisma.smsOutbox.findUnique.mock.calls.every(
      ([query]) => query.where.eventKey === LIVE_TEST_EVENT_KEY
    )).toBe(true);
    expect(result).toEqual({
      status: "ACCEPTED",
      trackingId: "hc-one-time-test-tracking-id",
      providerMessageId: "mock-provider-id",
    });
    expect(harness.getRecord()).toEqual(expect.objectContaining({
      status: "ACCEPTED",
      attempts: 1,
      providerMessageId: "mock-provider-id",
      processingAt: null,
    }));
  });

  it("uses a dedicated event-key namespace excluded from the normal four-event allowlist", () => {
    expect(isApprovedSmsEventKey(LIVE_TEST_EVENT_KEY)).toBe(false);
  });

  it("refuses repeated executions and cannot create or send a second test message", async () => {
    const harness = createHarness();
    await runSmsLiveTest(harness.dependencies);
    await expect(runSmsLiveTest(harness.dependencies)).rejects.toThrow("one-time live-test record already exists");
    expect(harness.enqueueSmsOnce).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledTimes(1);
  });

  it("records provider failure as terminal and never retries the send", async () => {
    const harness = createHarness({
      send: jest.fn().mockRejectedValue(new Error("Must not be exposed")),
    });
    const result = await runSmsLiveTest(harness.dependencies);
    expect(result.status).toBe("FAILED");
    expect(harness.getRecord()).toEqual(expect.objectContaining({
      status: "FAILED",
      attempts: 1,
      processingAt: null,
      lastError: "The one-time live-test provider attempt failed. Automatic retry is disabled.",
    }));
    await expect(runSmsLiveTest(harness.dependencies)).rejects.toThrow("one-time live-test record already exists");
    expect(harness.send).toHaveBeenCalledTimes(1);
  });

  it("refuses to send unless it atomically claims its own queued row", async () => {
    const harness = createHarness();
    harness.prisma.smsOutbox.updateMany.mockResolvedValue({ count: 0 });
    await expect(runSmsLiveTest(harness.dependencies)).rejects.toThrow("Could not exclusively claim");
    expect(harness.send).not.toHaveBeenCalled();
  });

  it("does not import or invoke normal server startup when command preflight refuses", async () => {
    const startServer = jest.fn();
    const serverModuleFactory = jest.fn(() => ({ startServer }));
    jest.doMock("../server", serverModuleFactory);
    const safety = { loadTestDatabase: jest.fn(), verifyTestDatabaseExists: jest.fn() };
    await expect(executeLiveSmsTest({
      config: { ...config, MOBILESASA_LIVE_TEST_ENABLED: "false" },
      safety,
    })).rejects.toThrow("Live SMS testing is disabled");
    expect(startServer).not.toHaveBeenCalled();
    expect(serverModuleFactory).not.toHaveBeenCalled();
    expect(safety.loadTestDatabase).not.toHaveBeenCalled();
  });
});
