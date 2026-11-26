const crypto = require("crypto");
const prisma = require("../services/prisma");
const { createTestArtifactTracker } = require("./helpers/testArtifactTracker");

const createEmail = (recipientEmail, template) => prisma.emailOutbox.create({
  data: {
    recipientEmail,
    template,
    payload: { name: "Cleanup regression" },
  },
});

const createSms = (eventKey) => prisma.smsOutbox.create({
  data: {
    recipientPhone: "+254712345678",
    message: "Cleanup regression",
    eventKey,
    trackingId: `cleanup-${crypto.randomUUID()}`,
  },
});

describe("test artifact tracking", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("removes only newly-created scoped email and SMS rows", async () => {
    const token = crypto.randomUUID();
    const ownerEmail = `cleanup-owner-${token}@hemoconnect.test`;
    const otherEmail = `cleanup-other-${token}@hemoconnect.test`;
    const ownerPrefix = `cleanup-owner-${token}`;
    const otherPrefix = `cleanup-other-${token}`;
    const ownerTracker = createTestArtifactTracker(prisma);
    const otherTracker = createTestArtifactTracker(prisma);
    const createdIds = { emails: [], sms: [] };
    let preexistingEmail;
    let preexistingSms;
    let ownerEmailRow;
    let ownerSmsRow;
    let otherEmailRow;
    let otherSmsRow;

    try {
      preexistingEmail = await createEmail(ownerEmail, "PREEXISTING_CLEANUP_TEST");
      createdIds.emails.push(preexistingEmail.emailId);
      preexistingSms = await createSms(`${ownerPrefix}-preexisting:sms`);
      createdIds.sms.push(preexistingSms.smsId);
      await ownerTracker.snapshotExisting();
      await otherTracker.snapshotExisting();
      ownerTracker.trackEmail({ recipientEmail: ownerEmail });
      ownerTracker.trackSms({ eventKey: { startsWith: `${ownerPrefix}-` } });
      otherTracker.trackEmail({ recipientEmail: otherEmail });
      otherTracker.trackSms({ eventKey: { startsWith: `${otherPrefix}-` } });

      ownerEmailRow = await createEmail(ownerEmail, "OWNED_CLEANUP_TEST");
      createdIds.emails.push(ownerEmailRow.emailId);
      ownerSmsRow = await createSms(`${ownerPrefix}-owned:sms`);
      createdIds.sms.push(ownerSmsRow.smsId);
      otherEmailRow = await createEmail(otherEmail, "OTHER_FIXTURE_CLEANUP_TEST");
      createdIds.emails.push(otherEmailRow.emailId);
      otherSmsRow = await createSms(`${otherPrefix}-owned:sms`);
      createdIds.sms.push(otherSmsRow.smsId);

      await ownerTracker.cleanup();

      expect(await prisma.emailOutbox.findUnique({
        where: { emailId: preexistingEmail.emailId },
      })).not.toBeNull();
      expect(await prisma.smsOutbox.findUnique({
        where: { smsId: preexistingSms.smsId },
      })).not.toBeNull();
      expect(await prisma.emailOutbox.findUnique({
        where: { emailId: ownerEmailRow.emailId },
      })).toBeNull();
      expect(await prisma.smsOutbox.findUnique({
        where: { smsId: ownerSmsRow.smsId },
      })).toBeNull();
      expect(await prisma.emailOutbox.findUnique({
        where: { emailId: otherEmailRow.emailId },
      })).not.toBeNull();
      expect(await prisma.smsOutbox.findUnique({
        where: { smsId: otherSmsRow.smsId },
      })).not.toBeNull();

      await otherTracker.cleanup();
      expect(await prisma.emailOutbox.findUnique({
        where: { emailId: otherEmailRow.emailId },
      })).toBeNull();
      expect(await prisma.smsOutbox.findUnique({
        where: { smsId: otherSmsRow.smsId },
      })).toBeNull();
    } finally {
      await ownerTracker.cleanup();
      await otherTracker.cleanup();
      await prisma.emailOutbox.deleteMany({ where: { emailId: { in: createdIds.emails } } });
      await prisma.smsOutbox.deleteMany({ where: { smsId: { in: createdIds.sms } } });
    }
  });
});
