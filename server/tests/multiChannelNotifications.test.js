const crypto = require("crypto");

const prisma = require("../services/prisma");
const {
  SmsProviderError,
  normalizeKenyanPhoneNumber,
  createMobileSasaProvider,
  isApprovedSmsEventKey,
  enqueueSmsOnce,
  processSmsOutbox,
  updateSmsDeliveryReport,
  verifyMobileSasaWebhook,
} = require("../services/sms");
const { enqueueEmail, processEmailOutbox, renderEmailTemplate } = require("../services/email");
const { notifyUser, queueHospitalInventoryAlert } = require("../services/notificationDelivery");
const { processAppointmentReminders, getNextNairobiDate } = require("../services/appointmentReminders");
const request = require("supertest");
const app = require("../app");
const env = require("../config/env");
const { createTestArtifactTracker } = require("./helpers/testArtifactTracker");

describe("multi-channel notification delivery", () => {
  let user;
  const eventPrefix = `task7-${crypto.randomUUID()}`;
  const artifactTracker = createTestArtifactTracker(prisma);

  beforeEach(async () => {
    await artifactTracker.snapshotExisting();
    user = await prisma.user.create({
      data: {
        firstName: "Notification",
        lastName: "Test",
        email: `${crypto.randomUUID()}@hemoconnect.test`,
        phone: "0712345678",
        password: "test-only-password",
        role: "DONOR",
        status: "ACTIVE",
      },
    });
    artifactTracker.trackNotification({ userId: user.userId });
    artifactTracker.trackEmail({ recipientEmail: user.email });
    artifactTracker.trackSms({
      OR: [
        { eventKey: { startsWith: eventPrefix } },
        { recipientPhone: { in: [user.phone, normalizeKenyanPhoneNumber(user.phone)].filter(Boolean) } },
      ],
    });
  });

  afterEach(async () => {
    try {
      await artifactTracker.cleanup();
    } finally {
      if (user?.userId) {
        await prisma.user.deleteMany({ where: { userId: user.userId } });
      }
    }
  });

  afterAll(async () => {
    try {
      await artifactTracker.cleanup();
    } finally {
      await prisma.$disconnect();
    }
  });

  it.each([
    ["0712345678", "+254712345678"],
    ["254112345678", "+254112345678"],
    ["+254 712 345 678", "+254712345678"],
  ])("normalizes Kenyan mobile number %s", (input, expected) => {
    expect(normalizeKenyanPhoneNumber(input)).toBe(expected);
  });

  it.each(["1234567890", "+255712345678", "072345678", "07123456789", ""])(
    "rejects invalid Kenyan mobile number %p",
    (input) => {
      expect(normalizeKenyanPhoneNumber(input)).toBeNull();
    }
  );

  it("uses MobileSasa v2 tracking IDs and handles provider acceptance and rejection", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: true, responseCode: "0200", messageId: "provider-id" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: false, responseCode: "0422", message: "Invalid phone" }),
      });
    const provider = createMobileSasaProvider({
      token: "mock-token",
      senderId: "MOCK",
      callbackUrl: "https://example.test/api/notifications/sms/delivery-reports",
      fetchImpl,
    });

    await expect(provider.send({
      phone: "+254712345678",
      message: "Appointment reminder",
      trackingId: "hc-test-123",
    })).resolves.toEqual({ providerMessageId: "provider-id" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.mobilesasa.com/v2/send/message");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      phone: "+254712345678",
      trackingId: "hc-test-123",
      callbackUrl: "https://example.test/api/notifications/sms/delivery-reports",
    }));

    await expect(provider.send({
      phone: "+254712345678",
      message: "Bad",
      trackingId: "hc-test-456",
    })).rejects.toMatchObject({ retryable: false, responseCode: "0422" });
  });

  it("recognizes only the four approved SMS event key formats", () => {
    expect([
      "account-12-registered:sms",
      "questionnaire-34-approved:sms",
      "appointment-56-accepted:sms",
      "donation-78-completed:sms",
    ].every(isApprovedSmsEventKey)).toBe(true);
    expect([
      "questionnaire-34-submitted:sms",
      "questionnaire-34-declined:sms",
      "appointment-56-booked:sms",
      "appointment-56-cancelled:sms",
      "appointment-56-reminder:sms",
      "emergency-90-donor-12:sms",
      "inventory-low-7-staff-12:sms",
    ].some(isApprovedSmsEventKey)).toBe(false);
  });

  it("does not process queued messages for events outside the approved SMS scope", async () => {
    const timestamp = Date.now();
    const eventKeys = [
      `questionnaire-${timestamp}-submitted:sms`,
      `questionnaire-${timestamp + 1}-declined:sms`,
      `appointment-${timestamp}-booked:sms`,
      `appointment-${timestamp + 1}-cancelled:sms`,
      `appointment-${timestamp + 2}-reminder:sms`,
      `questionnaire-not-a-number-approved:sms`,
      `emergency-${timestamp}-donor-12:sms`,
      `inventory-low-${timestamp}-staff-12:sms`,
    ];
    const provider = { send: jest.fn() };

    for (const eventKey of eventKeys) {
      const { sms } = await prisma.$transaction((tx) =>
        enqueueSmsOnce(tx, user.phone, "Must remain queued.", eventKey)
      );
      await expect(processSmsOutbox(
        new Date(Date.now() + 60_000),
        provider,
        { eventKey }
      )).resolves.toBe(0);
      expect(await prisma.smsOutbox.findUnique({
        where: { smsId: sms.smsId },
      })).toEqual(expect.objectContaining({ status: "QUEUED", attempts: 0 }));
    }

    expect(provider.send).not.toHaveBeenCalled();
  });

  it("does not process the dedicated live-test event namespace", async () => {
    const eventKey = `mobilesasa-live-test:${crypto.randomUUID()}`;
    const { sms } = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, user.phone, "Isolated live-test namespace.", eventKey)
    );
    const provider = { send: jest.fn() };

    await expect(processSmsOutbox(
      new Date(Date.now() + 60_000),
      provider,
      { eventKey }
    )).resolves.toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
    expect(await prisma.smsOutbox.findUnique({ where: { smsId: sms.smsId } }))
      .toEqual(expect.objectContaining({ status: "QUEUED", attempts: 0 }));
  });

  it("does not change a live-test record during normal-worker stale processing cleanup", async () => {
    const eventKey = `mobilesasa-live-test:${crypto.randomUUID()}`;
    const { sms } = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, user.phone, "Isolated live-test namespace.", eventKey)
    );
    const processingAt = new Date(Date.now() - 11 * 60 * 1000);
    await prisma.smsOutbox.update({
      where: { smsId: sms.smsId },
      data: { status: "PROCESSING", processingAt },
    });
    const provider = { send: jest.fn() };

    await expect(processSmsOutbox(new Date(), provider, { eventKey })).resolves.toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
    expect(await prisma.smsOutbox.findUnique({ where: { smsId: sms.smsId } }))
      .toEqual(expect.objectContaining({ status: "PROCESSING", processingAt }));
  });

  it("deduplicates SMS queue records, retries transient failures and records handset delivery", async () => {
    const eventKey = `questionnaire-${Date.now()}-approved:sms`;
    const first = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, "0712345678", "Your appointment is tomorrow.", eventKey)
    );
    const second = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, "+254 712 345 678", "Your appointment is tomorrow.", eventKey)
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.sms.recipientPhone).toBe("+254712345678");

    const retryTime = new Date(Date.now() + 2 * 60 * 1000);
    const provider = { send: jest.fn().mockRejectedValue(new SmsProviderError("Temporary outage")) };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(processSmsOutbox(retryTime, provider, { eventKey })).resolves.toBe(0);
      let queued = await prisma.smsOutbox.findUnique({ where: { eventKey } });
      expect(queued).toEqual(expect.objectContaining({ status: "QUEUED", attempts: 1 }));

      provider.send.mockResolvedValue({ providerMessageId: "mobile-sasa-id" });
      await expect(processSmsOutbox(new Date(queued.nextAttemptAt.getTime() + 1000), provider, { eventKey })).resolves.toBe(1);
      queued = await prisma.smsOutbox.findUnique({ where: { eventKey } });
      expect(queued).toEqual(expect.objectContaining({
        status: "ACCEPTED",
        providerMessageId: "mobile-sasa-id",
      }));
      expect(provider.send.mock.calls[1][0].trackingId).toBe(first.sms.trackingId);

      expect(await updateSmsDeliveryReport({
        trackingId: first.sms.trackingId,
        reference: "mobile-sasa-id",
        status: "Delivered",
        deliveryStatus: "DeliveredToTerminal",
      })).toBe(true);
      expect((await prisma.smsOutbox.findUnique({ where: { eventKey } })).status).toBe("DELIVERED");
      await expect(processSmsOutbox(new Date(Date.now() + 24 * 60 * 60 * 1000), provider, { eventKey })).resolves.toBe(0);
      expect(provider.send).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("records invalid recipient numbers as terminal failures without sending", async () => {
    const eventKey = `${eventPrefix}-invalid-phone`;
    const queued = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, "+255712345678", "Appointment information", eventKey)
    );
    expect(queued.created).toBe(true);
    expect(queued.sms).toEqual(expect.objectContaining({
      recipientPhone: null,
      status: "FAILED",
      failedAt: expect.any(Date),
    }));
    await expect(processSmsOutbox(
      new Date(Date.now() + 60_000),
      { send: jest.fn() },
      { eventKey }
    )).resolves.toBe(0);
  });

  it("verifies signed MobileSasa callbacks and rejects altered or stale reports", () => {
    const secret = "test-webhook-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = Buffer.from(JSON.stringify({ trackingId: "hc-test", status: "Delivered" }));
    const signature = crypto.createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest("hex");

    expect(verifyMobileSasaWebhook(rawBody, {
      "x-mobilesasa-signature": `t=${timestamp},v1=${signature}`,
    }, secret)).toBe(true);
    expect(verifyMobileSasaWebhook(Buffer.from("altered"), {
      "x-mobilesasa-signature": `t=${timestamp},v1=${signature}`,
    }, secret)).toBe(false);
    expect(verifyMobileSasaWebhook(rawBody, {
      "x-mobilesasa-signature": `t=${Number(timestamp) - 600},v1=${signature}`,
    }, secret)).toBe(false);
  });

  it("accepts a signed delivery-report callback and updates delivery state", async () => {
    const eventKey = `${eventPrefix}-webhook`;
    const { sms } = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, user.phone, "Delivery callback test.", eventKey)
    );
    await prisma.smsOutbox.update({
      where: { smsId: sms.smsId },
      data: { status: "ACCEPTED", providerMessageId: "provider-webhook-id" },
    });

    const originalSecret = env.MOBILESASA_WEBHOOK_SECRET;
    env.MOBILESASA_WEBHOOK_SECRET = "test-webhook-secret";
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({
        trackingId: sms.trackingId,
        reference: "provider-webhook-id",
        status: "Delivered",
        deliveryStatus: "DeliveredToTerminal",
      });
      const signature = crypto.createHmac("sha256", env.MOBILESASA_WEBHOOK_SECRET)
        .update(`${timestamp}.`)
        .update(Buffer.from(body))
        .digest("hex");
      const response = await request(app)
        .post("/api/notifications/sms/delivery-reports")
        .set("Content-Type", "application/json")
        .set("X-MobileSasa-Signature", `t=${timestamp},v1=${signature}`)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeUndefined();
      expect((await prisma.smsOutbox.findUnique({ where: { smsId: sms.smsId } })).status).toBe("DELIVERED");
    } finally {
      env.MOBILESASA_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("records provider acceptance time for an interim delivery report", async () => {
    const eventKey = `${eventPrefix}-interim-report`;
    const { sms } = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, user.phone, "Interim report test.", eventKey)
    );
    await prisma.smsOutbox.update({
      where: { smsId: sms.smsId },
      data: { status: "PROCESSING", processingAt: new Date() },
    });

    expect(await updateSmsDeliveryReport({ trackingId: sms.trackingId, status: "Sent" })).toBe(true);
    expect(await prisma.smsOutbox.findUnique({ where: { smsId: sms.smsId } }))
      .toEqual(expect.objectContaining({ status: "ACCEPTED", acceptedAt: expect.any(Date) }));
  });

  it("queues in-app, email, and an approved SMS atomically after its caller commits", async () => {
    const eventKey = `${eventPrefix}-multi`;
    await prisma.$transaction((tx) => notifyUser(tx, {
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      eventKey,
      type: "QUESTIONNAIRE_APPROVED",
      title: "Test update",
      message: "A test update.",
      emailTemplate: "WELCOME",
      emailPayload: { name: "Notification Test", role: "donor" },
      smsMessage: "A test update.",
    }));

    expect(await prisma.notification.count({
      where: {
        userId: user.userId,
        type: "QUESTIONNAIRE_APPROVED",
        message: "A test update.",
      },
    })).toBe(1);
    expect(await prisma.emailOutbox.count({
      where: { recipientEmail: user.email, template: "WELCOME" },
    })).toBe(1);
    expect(await prisma.smsOutbox.count({
      where: { eventKey: `${eventKey}:sms`, status: "QUEUED" },
    })).toBe(1);

    const rolledBackKey = `${eventPrefix}-rollback`;
    await expect(prisma.$transaction(async (tx) => {
      await notifyUser(tx, {
        userId: user.userId,
        email: user.email,
        phone: user.phone,
        eventKey: rolledBackKey,
        type: "QUESTIONNAIRE_APPROVED",
        title: "Must not persist",
        message: "A transaction that will roll back.",
        emailTemplate: "WELCOME",
        emailPayload: { name: "Notification Test", role: "donor" },
        smsMessage: "Must not persist.",
      });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await prisma.notification.count({
      where: { userId: user.userId, type: "QUESTIONNAIRE_APPROVED" },
    })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { recipientEmail: user.email, template: "WELCOME" } })).toBe(1);
    expect(await prisma.smsOutbox.count({ where: { eventKey: `${rolledBackKey}:sms` } })).toBe(0);
  });

  it("rejects SMS requests for events outside the approved event list", async () => {
    const eventKey = `${eventPrefix}-unapproved`;
    await expect(prisma.$transaction((tx) => notifyUser(tx, {
      userId: user.userId,
      email: user.email,
      phone: user.phone,
      eventKey,
      type: "TEST_UNAPPROVED_EVENT",
      title: "Test update",
      message: "An event that is not approved for SMS.",
      smsMessage: "This must not be queued.",
    }))).rejects.toThrow("SMS is not enabled for notification event: TEST_UNAPPROVED_EVENT.");
    expect(await prisma.smsOutbox.count({ where: { eventKey: `${eventKey}:sms` } })).toBe(0);
    expect(await prisma.notification.count({
      where: { userId: user.userId, type: "TEST_UNAPPROVED_EVENT" },
    })).toBe(0);
  });

  it("retries email failures and does not resend a successfully accepted outbox message", async () => {
    const email = await prisma.$transaction((tx) =>
      enqueueEmail(tx, user.email, "WELCOME", { name: "Notification Test", role: "donor" })
    );
    const transport = {
      sendMail: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error("Temporary SMTP failure"), { code: "ETIMEDOUT" }))
        .mockResolvedValueOnce({ accepted: [user.email], rejected: [] }),
    };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(processEmailOutbox(new Date(Date.now() + 60_000), transport, {
        recipientEmail: user.email,
      })).resolves.toBe(0);
      let queued = await prisma.emailOutbox.findUnique({ where: { emailId: email.emailId } });
      expect(queued).toEqual(expect.objectContaining({ status: "QUEUED", attempts: 1 }));

      await expect(processEmailOutbox(new Date(queued.nextAttemptAt.getTime() + 1000), transport, {
        recipientEmail: user.email,
      })).resolves.toBe(1);
      queued = await prisma.emailOutbox.findUnique({ where: { emailId: email.emailId } });
      expect(queued).toEqual(expect.objectContaining({ status: "SENT", attempts: 1, sentAt: expect.any(Date) }));
      expect(transport.sendMail.mock.calls[0][0].messageId).toBe(transport.sendMail.mock.calls[1][0].messageId);
      await expect(processEmailOutbox(new Date(Date.now() + 24 * 60 * 60 * 1000), transport, {
        recipientEmail: user.email,
      })).resolves.toBe(0);
      expect(transport.sendMail).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("does not mark an SMTP-rejected recipient as sent", async () => {
    const email = await prisma.$transaction((tx) =>
      enqueueEmail(tx, user.email, "WELCOME", { name: "Notification Test", role: "donor" })
    );
    const transport = {
      sendMail: jest.fn().mockResolvedValue({ accepted: [], rejected: [user.email] }),
    };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(processEmailOutbox(new Date(Date.now() + 60_000), transport, {
        recipientEmail: user.email,
      })).resolves.toBe(0);
      expect(await prisma.emailOutbox.findUnique({ where: { emailId: email.emailId } }))
        .toEqual(expect.objectContaining({ status: "QUEUED", attempts: 1, sentAt: null }));
    } finally {
      log.mockRestore();
    }
  });

  it("does not retry an email with an ambiguous stale worker outcome", async () => {
    const email = await prisma.emailOutbox.create({
      data: {
        recipientEmail: user.email,
        template: "WELCOME",
        payload: { name: "Notification Test", role: "donor" },
        status: "PROCESSING",
        processingAt: new Date(Date.now() - 11 * 60 * 1000),
      },
    });
    const transport = { sendMail: jest.fn() };
    await expect(processEmailOutbox(new Date(), transport, {
      recipientEmail: user.email,
    })).resolves.toBe(0);
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(await prisma.emailOutbox.findUnique({ where: { emailId: email.emailId } }))
      .toEqual(expect.objectContaining({ status: "FAILED", processingAt: null }));
  });

  it("preserves a terminal SMS delivery report that races a provider error", async () => {
    const eventKey = `donation-${Date.now()}-completed:sms`;
    const { sms } = await prisma.$transaction((tx) =>
      enqueueSmsOnce(tx, user.phone, "Race condition test.", eventKey)
    );
    const provider = {
      send: jest.fn(async () => {
        await prisma.smsOutbox.update({
          where: { smsId: sms.smsId },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
        throw new SmsProviderError("Provider response arrived late.");
      }),
    };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(processSmsOutbox(new Date(Date.now() + 60_000), provider, { eventKey })).resolves.toBe(0);
      expect(await prisma.smsOutbox.findUnique({ where: { smsId: sms.smsId } }))
        .toEqual(expect.objectContaining({ status: "DELIVERED", attempts: 0 }));
    } finally {
      log.mockRestore();
    }
  });

  it("sends low-inventory alerts only to active staff at the owning hospital", async () => {
    const hospitalStaff = await prisma.hospitalStaff.findFirst({
      where: { user: { status: "ACTIVE", role: "HOSPITAL_STAFF" } },
      include: { user: { select: { userId: true, email: true, phone: true } } },
    });
    const inventory = await prisma.bloodInventory.findFirst({
      where: { hospitalId: hospitalStaff.hospitalId },
    });
    const donor = await prisma.user.findFirst({ where: { role: "DONOR" }, select: { userId: true } });
    const activeStaff = await prisma.hospitalStaff.findMany({
      where: {
        hospitalId: hospitalStaff.hospitalId,
        user: { status: "ACTIVE", role: "HOSPITAL_STAFF" },
      },
      select: { user: { select: { userId: true, email: true } } },
    });
    const startedAt = new Date();
    const alertKey = `${eventPrefix}-inventory`;
    artifactTracker.trackNotification({
      userId: { in: activeStaff.map(({ user: staffUser }) => staffUser.userId) },
      type: "HOSPITAL_INVENTORY_ALERT",
    });
    artifactTracker.trackSms({ eventKey: { startsWith: `${alertKey}-staff-` } });
    artifactTracker.trackEmail({
      recipientEmail: { in: activeStaff.map(({ user: staffUser }) => staffUser.email) },
      template: "INVENTORY_ALERT",
    });
    artifactTracker.trackAudit({
      action: "HOSPITAL_LOW_INVENTORY_ALERT_QUEUED",
      entityId: String(inventory.inventoryId),
    });

    await prisma.$transaction((tx) => queueHospitalInventoryAlert(tx, {
      inventory: { ...inventory, unitsAvailable: 0, minimumUnits: 5 },
      eventKey: alertKey,
      actorUserId: hospitalStaff.userId,
    }));

    const notifications = await prisma.notification.findMany({
      where: {
        userId: { in: activeStaff.map(({ user: staffUser }) => staffUser.userId) },
        type: "HOSPITAL_INVENTORY_ALERT",
        createdAt: { gte: startedAt },
      },
    });
    expect(notifications.length).toBe(activeStaff.length);
    expect(notifications.some(({ userId }) => userId === donor?.userId)).toBe(false);
    expect(await prisma.smsOutbox.count({
      where: { eventKey: { startsWith: `${alertKey}-staff-` } },
    })).toBe(0);
    expect(await prisma.emailOutbox.count({
      where: {
        recipientEmail: { in: activeStaff.map(({ user: staffUser }) => staffUser.email) },
        template: "INVENTORY_ALERT",
      },
    })).toBe(activeStaff.length);
  });

  it("queues a single in-app reminder without an SMS for the next Nairobi appointment day", async () => {
    const hospital = await prisma.hospital.findFirst({
      where: { institutionType: "HOSPITAL", isActive: true },
    });
    const donor = await prisma.donor.create({
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        bloodType: "O+",
        birthDate: new Date("1996-05-10T00:00:00.000Z"),
        gender: "OTHER",
        address: "Nairobi",
        userId: user.userId,
      },
    });
    const now = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        donorId: donor.donorId,
        hospitalId: hospital.hospitalId,
        date: getNextNairobiDate(now),
        time: "10:00",
        purpose: "Blood Donation",
        status: "SCHEDULED",
      },
    });
    artifactTracker.trackNotification({
      userId: user.userId,
      type: "APPOINTMENT_REMINDER",
    });
    artifactTracker.trackSms({
      eventKey: `appointment-${appointment.appointmentId}-reminder:sms`,
    });
    try {
      expect(await processAppointmentReminders(now, { appointmentId: appointment.appointmentId })).toBe(1);
      expect(await processAppointmentReminders(now, { appointmentId: appointment.appointmentId })).toBe(0);
      const [notification, sms] = await Promise.all([
        prisma.notification.findFirst({
          where: { userId: user.userId, type: "APPOINTMENT_REMINDER" },
        }),
        prisma.smsOutbox.findUnique({
          where: { eventKey: `appointment-${appointment.appointmentId}-reminder:sms` },
        }),
      ]);
      expect(notification.message).toContain(hospital.name);
      expect(notification.message).toContain("10:00");
      expect(sms).toBeNull();
      expect(await prisma.notification.count({
        where: { userId: user.userId, type: "APPOINTMENT_REMINDER" },
      })).toBe(1);
    } finally {
      await prisma.appointment.delete({ where: { appointmentId: appointment.appointmentId } });
      await prisma.donor.delete({ where: { donorId: donor.donorId } });
    }
  });

  it("renders appointment email with its real reference and hospital data", () => {
    const rendered = renderEmailTemplate("APPOINTMENT_BOOKED", {
      name: "A Donor",
      date: new Date("2026-11-28T00:00:00.000Z"),
      time: "10:00",
      hospital: "Test Hospital",
      purpose: "Blood Donation",
      reference: "HC-901",
    });
    expect(rendered.text).toContain("Test Hospital");
    expect(rendered.text).toContain("28 Nov 2026");
    expect(rendered.text).toContain("10:00");
    expect(rendered.text).toContain("HC-901");
  });
});
