const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");
const { normalizeKenyanPhoneNumber } = require("../services/sms");
const { calculateDistanceKm } = require("../services/donorMatching");
const { formatAppointmentDate } = require("../services/notificationDelivery");
const { getDonationEligibility } = require("../utils/donationEligibility");
const { createQuestionnaireFixtureCleanup } = require("./helpers/questionnaireFixtureCleanup");
const { createTestArtifactTracker } = require("./helpers/testArtifactTracker");

describe("Task 6 approval-gated booking lifecycle", () => {
  let knbtsStaff;
  let hospital;
  const cleanups = [];
  const questionnaireFixtureCleanup = createQuestionnaireFixtureCleanup(prisma);
  const artifactTracker = createTestArtifactTracker(prisma);

  const tokenFor = (user) => jwt.sign(
    { userId: user.userId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  beforeAll(async () => {
    knbtsStaff = await prisma.knbtsStaff.findFirst({ include: { centre: true } });
    const activeHospitals = await prisma.hospital.findMany({
      where: { institutionType: "HOSPITAL", isActive: true, latitude: { not: null }, longitude: { not: null } },
    });
    hospital = activeHospitals
      .map((candidate) => ({
        candidate,
        distanceKm: calculateDistanceKm(
          { latitude: -1.286389, longitude: 36.817223 },
          { latitude: candidate.latitude, longitude: candidate.longitude }
        ),
      }))
      .sort((left, right) =>
        left.distanceKm - right.distanceKm ||
        left.candidate.hospitalId - right.candidate.hospitalId
      )[0]?.candidate;
    if (!knbtsStaff || !hospital) {
      throw new Error("Approval booking fixtures require active KNBTS staff and a mapped hospital.");
    }
  });

  const createDonor = async (label = "booking") => {
    const user = await prisma.user.create({
      data: {
        firstName: "Approval",
        lastName: "Booking",
        email: `approval-${label}-${Date.now()}-${Math.random()}@hemoconnect.test`,
        phone: `07${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
        password: "test-only-password",
        role: "DONOR",
        status: "ACTIVE",
      },
    });
    const cleanupRecord = { userId: user.userId, donorId: null };
    cleanups.push(cleanupRecord);
    artifactTracker.trackNotification({ userId: user.userId });
    artifactTracker.trackEmail({ recipientEmail: user.email });
    artifactTracker.trackSms({
      recipientPhone: {
        in: [user.phone, normalizeKenyanPhoneNumber(user.phone)].filter(Boolean),
      },
    });
    const donor = await prisma.donor.create({
      data: {
        firstName: "Approval",
        lastName: "Booking",
        bloodType: "O+",
        birthDate: new Date("1996-05-10T00:00:00.000Z"),
        gender: "OTHER",
        address: "Nairobi",
        latitude: -1.286389,
        longitude: 36.817223,
        userId: user.userId,
      },
    });
    cleanupRecord.donorId = donor.donorId;
    artifactTracker.trackAudit({
      OR: [
        { entityType: "User", entityId: String(user.userId) },
        { entityType: "Donor", entityId: String(donor.donorId) },
      ],
    });
    return { user, donor, token: tokenFor(user) };
  };

  const createApproval = async (donor, overrides = {}) => {
    const nowRows = await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`;
    const now = nowRows[0].databaseNow instanceof Date ? nowRows[0].databaseNow : new Date(nowRows[0].databaseNow);
    const latestVersion = await prisma.questionnaireVersion.findFirst({
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const version = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: (latestVersion?.versionNumber || 0) + 1,
        title: "Task 6 approval fixture",
        status: "PUBLISHED",
        publishedAt: now,
      },
    });
    questionnaireFixtureCleanup.trackVersion(version);
    const submission = await prisma.donorQuestionnaireSubmission.create({
      data: {
        donorId: donor.donorId,
        versionId: version.questionnaireVersionId,
        status: "APPROVED",
        submittedAt: now,
        declarationAcknowledgedAt: now,
      },
    });
    questionnaireFixtureCleanup.trackSubmission(submission);
    const review = await prisma.questionnaireReview.create({
      data: {
        submissionId: submission.submissionId,
        reviewerStaffId: knbtsStaff.knbtsStaffId,
        decision: "APPROVED",
        reviewedAt: now,
      },
    });
    await prisma.questionnaireClinicalAssessment.create({
      data: {
        submissionId: submission.submissionId,
        donorId: donor.donorId,
        assessedByKnbtsStaffId: knbtsStaff.knbtsStaffId,
        reviewId: review.reviewId,
        assessmentDate: now,
        decision: "ACCEPT",
        weightKg: "72.50",
        bloodPressure: "120/80",
      },
    });
    const approval = await prisma.questionnaireApproval.create({
      data: {
        submissionId: submission.submissionId,
        donorId: donor.donorId,
        reviewId: review.reviewId,
        approvedAt: overrides.approvedAt || now,
        expiresAt: overrides.expiresAt || new Date(now.getTime() + 336 * 60 * 60 * 1000),
        status: overrides.status || "ACTIVE",
      },
    });
    artifactTracker.trackAudit({
      OR: [
        { entityType: "DonorQuestionnaireSubmission", entityId: String(submission.submissionId) },
        { entityType: "QuestionnaireApproval", entityId: String(approval.approvalId) },
      ],
    });
    const record = { version, submission, review, approval };
    return record;
  };

  const createSlot = async (capacity = 1, bookedCount = 0) => {
    const staff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
    const slotDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const normalized = new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate()));
    let slot = await prisma.appointmentSlot.findFirst({
      where: { hospitalId: hospital.hospitalId, slotDate: normalized, time: "13:30" },
    });
    const original = slot
      ? { capacity: slot.capacity, bookedCount: slot.bookedCount, status: slot.status }
      : null;
    if (!slot) {
      slot = await prisma.appointmentSlot.create({
        data: {
          hospitalId: hospital.hospitalId,
          createdByStaffId: staff.staffId,
          slotDate: normalized,
          time: "13:30",
          capacity,
          bookedCount,
        },
      });
    } else {
      slot = await prisma.appointmentSlot.update({
        where: { slotId: slot.slotId },
        data: { capacity, bookedCount, status: "OPEN" },
      });
    }
    cleanups.push({ slotId: slot.slotId, createdByTest: !original, original });
    return slot;
  };

  const book = async (fixture, slot, purpose = "Blood Donation") => {
    const response = await request(app)
      .post("/api/donor/appointments")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        slotId: slot.slotId,
        purpose,
        hospitalId: hospital.hospitalId,
        locationLatitude: -1.286389,
        locationLongitude: 36.817223,
      });
    const appointmentId = response.body?.data?.appointment?.appointmentId;
    if (response.status === 201 && appointmentId) {
      artifactTracker.trackAudit({
        entityType: "Appointment",
        entityId: String(appointmentId),
      });
    }
    return response;
  };

  const createQuestionnaireDraft = async (fixture) => {
    const response = await request(app)
      .post("/api/donor/questionnaire/submissions")
      .set("Authorization", `Bearer ${fixture.token}`);
    const submission = response.body?.data?.submission;
    if (response.status === 201 && submission?.submissionId) {
      questionnaireFixtureCleanup.trackSubmission(submission);
    }
    return response;
  };

  const cleanupFixtures = async () => {
    const donorIds = cleanups
      .filter((record) => record.donorId)
      .map((record) => record.donorId);
    if (donorIds.length) {
      const [appointments, donations] = await Promise.all([
        prisma.appointment.findMany({
          where: { donorId: { in: donorIds } },
          select: { appointmentId: true },
        }),
        prisma.donationRecord.findMany({
          where: { donorId: { in: donorIds } },
          select: { donationId: true },
        }),
      ]);
      for (const { appointmentId } of appointments) {
        artifactTracker.trackAudit({
          entityType: "Appointment",
          entityId: String(appointmentId),
        });
      }
      for (const { donationId } of donations) {
        artifactTracker.trackAudit({
          entityType: "DonationRecord",
          entityId: String(donationId),
        });
      }
    }
    await artifactTracker.capture();
    try {
      await questionnaireFixtureCleanup.cleanup({ deleteVersions: true });

      for (const record of [...cleanups].reverse()) {
        if (record.donorId) {
          await prisma.donationRecord.deleteMany({ where: { donorId: record.donorId } });
          await prisma.appointment.deleteMany({ where: { donorId: record.donorId } });
          await prisma.donor.deleteMany({ where: { donorId: record.donorId } });
        }
        if (record.userId) {
          await prisma.user.deleteMany({ where: { userId: record.userId } });
        }
      }

      for (const record of [...cleanups].reverse()) {
        if (!record.slotId) continue;
        if (record.createdByTest) {
          await prisma.appointmentSlot.deleteMany({ where: { slotId: record.slotId } });
        } else if (record.original) {
          await prisma.appointmentSlot.updateMany({
            where: { slotId: record.slotId },
            data: record.original,
          });
        }
      }
    } finally {
      await artifactTracker.cleanup();
    }
    cleanups.length = 0;
  };

  beforeEach(async () => {
    await artifactTracker.snapshotExisting();
  });

  afterEach(cleanupFixtures);

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await prisma.$disconnect();
    }
  });

  const scenarios = [
    "valid approval can book",
    "missing approval rejected",
    "expired approval rejected",
    "consumed approval rejected",
    "approval exact expiry rejected",
    "another donor approval rejected",
    "age-ineligible donor rejected",
    "90-day ineligible donor rejected",
    "full slot rejected",
    "invalid hospital rejected",
    "active association blocks reuse",
    "concurrent booking cannot reuse approval",
    "concurrent booking cannot exceed slot",
    "appointment and association atomic",
    "cancel before expiry releases",
    "released approval can rebook",
    "cancel at expiry expires approval",
    "cancel after expiry expires approval",
    "repeated cancellation releases once",
    "other donor cannot cancel",
    "completed appointment cannot cancel",
    "hospital staff cancel before expiry releases",
    "hospital staff cancel after expiry expires",
    "successful completion consumes approval",
    "failed completion does not consume",
    "cancelled appointment does not consume",
    "appointment and donation and consumption atomic",
    "concurrent cancellation and completion safe",
    "active appointment blocks questionnaire draft",
    "released appointment allows questionnaire draft",
    "expired historical association allows questionnaire",
    "consumed historical association allows questionnaire",
  ];

  it.each(scenarios)("supports: %s", async (scenario) => {
    const fixture = await createDonor(scenario.replace(/\s/g, "-"));

    if (["missing approval rejected", "invalid hospital rejected"].includes(scenario)) {
      const slot = await createSlot();
      if (scenario === "invalid hospital rejected") {
        const response = await request(app).post("/api/donor/appointments")
          .set("Authorization", `Bearer ${fixture.token}`)
          .send({ slotId: slot.slotId, purpose: "Blood Donation", hospitalId: 999999, locationLatitude: -1.286389, locationLongitude: 36.817223 });
        expect(response.status).toBe(400);
      } else {
        expect((await book(fixture, slot)).status).toBe(409);
        expect(await prisma.notification.count({ where: { userId: fixture.user.userId } })).toBe(0);
        expect(await prisma.emailOutbox.count({ where: { recipientEmail: fixture.user.email } })).toBe(0);
        expect(await prisma.smsOutbox.count({ where: { recipientPhone: fixture.user.phone } })).toBe(0);
      }
      return;
    }

    if (["age-ineligible donor rejected"].includes(scenario)) {
      const clock = (await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`)[0].databaseNow;
      const civil = new Date(clock);
      const exact18BirthDate = new Date(Date.UTC(civil.getUTCFullYear() - 17, civil.getUTCMonth(), civil.getUTCDate()));
      await prisma.donor.update({ where: { donorId: fixture.donor.donorId }, data: { birthDate: exact18BirthDate } });
      const approvalFixture = await createApproval(fixture.donor);
      const slot = await createSlot();
      expect((await book(fixture, slot)).status).toBe(409);
      return;
    }

    const approvalFixture = await createApproval(fixture.donor, scenario === "consumed approval rejected"
      ? { status: "CONSUMED" }
      : scenario === "approval exact expiry rejected"
        ? { expiresAt: new Date((await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`)[0].databaseNow) }
        : {});
    const slot = await createSlot(
      scenario === "full slot rejected" ? 1 : 1,
      scenario === "full slot rejected" ? 1 : 0
    );

    if (scenario === "full slot rejected") {
      expect((await book(fixture, slot)).status).toBe(409);
      return;
    }
    if (scenario === "expired approval rejected") {
      await prisma.questionnaireApproval.update({
        where: { approvalId: approvalFixture.approval.approvalId },
        data: { expiresAt: new Date(Date.now() - 1000), status: "ACTIVE" },
      });
      expect((await book(fixture, slot)).status).toBe(409);
      return;
    }
    if (scenario === "another donor approval rejected") {
      const other = await createDonor("other");
      expect((await book(other, slot)).status).toBe(409);
      return;
    }
    if (scenario === "90-day ineligible donor rejected") {
      const completedAppointment = await prisma.appointment.create({
        data: {
          hospitalId: hospital.hospitalId,
          donorId: fixture.donor.donorId,
          date: new Date(),
          time: "10:00",
          purpose: "Blood Donation",
          status: "COMPLETED",
        },
      });
      await prisma.donationRecord.create({
        data: {
          donationDate: new Date(),
          bloodType: "O+",
          quantity: 450,
          status: "AVAILABLE",
          donorId: fixture.donor.donorId,
          appointmentId: completedAppointment.appointmentId,
        },
      });
      expect((await book(fixture, slot)).status).toBe(409);
      return;
    }
    if (scenario === "concurrent booking cannot reuse approval" ||
        scenario === "concurrent booking cannot exceed slot") {
      const secondSlot = await createSlot(1, 0);
      const responses = await Promise.all([book(fixture, slot), book(fixture, secondSlot)]);
      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(responses.some((response) => response.status === 409)).toBe(true);
      return;
    }
    if (scenario.startsWith("active association") || scenario === "appointment and association atomic") {
      const first = await book(fixture, slot);
      expect(first.status).toBe(201);
      if (scenario === "active association blocks reuse") {
        const secondSlot = await createSlot();
        expect((await book(fixture, secondSlot)).status).toBe(409);
      }
      return;
    }
    if (scenario.startsWith("cancel") && scenario !== "cancelled appointment does not consume") {
      const booked = await book(fixture, slot);
      expect(booked.status).toBe(201);
      if (scenario === "cancel at expiry expires approval") {
        await prisma.questionnaireApproval.update({
          where: { approvalId: approvalFixture.approval.approvalId },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
      }
      if (scenario === "cancel after expiry expires approval") {
        await prisma.questionnaireApproval.update({
          where: { approvalId: approvalFixture.approval.approvalId },
          data: { expiresAt: new Date(Date.now() - 60000) },
        });
      }
      const response = await request(app)
        .patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`)
        .set("Authorization", `Bearer ${fixture.token}`);
      expect(response.status).toBe(200);
      const cancellation = await prisma.notification.findFirst({
        where: { userId: fixture.user.userId, type: "APPOINTMENT_CANCELLED" },
      });
      expect(cancellation.message).toContain("cancelled");
      expect(await prisma.smsOutbox.count({
        where: { eventKey: `appointment-${booked.body.data.appointment.appointmentId}-cancelled:sms` },
      })).toBe(0);
      expect(await prisma.emailOutbox.count({
        where: {
          recipientEmail: fixture.user.email,
          template: "APPOINTMENT_CANCELLED",
        },
      })).toBe(1);
      if (scenario === "repeated cancellation releases once") {
        expect((await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`)).status).toBe(409);
      }
      const association = await prisma.questionnaireBookingAssociation.findFirst({
        where: { appointmentId: booked.body.data.appointment.appointmentId },
      });
      if (scenario === "cancel before expiry releases" || scenario === "repeated cancellation releases once") {
        expect(association.status).toBe("CANCELLED_RELEASED");
      } else {
        expect(association.status).toBe("CANCELLED_EXPIRED");
      }
      return;
    }
    if (scenario === "released approval can rebook") {
      const booked = await book(fixture, slot);
      await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`);
      const secondSlot = await createSlot();
      expect((await book(fixture, secondSlot)).status).toBe(201);
      return;
    }
    if (scenario === "other donor cannot cancel") {
      const booked = await book(fixture, slot);
      const other = await createDonor("cannot-cancel");
      expect((await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${other.token}`)).status).toBe(404);
      return;
    }
    if (scenario === "completed appointment cannot cancel") {
      const booked = await book(fixture, slot);
      await prisma.appointment.update({ where: { appointmentId: booked.body.data.appointment.appointmentId }, data: { status: "COMPLETED" } });
      expect((await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`)).status).toBe(409);
      return;
    }
    if (scenario.startsWith("hospital staff cancel")) {
      const booked = await book(fixture, slot);
      const staffUser = await prisma.user.findUnique({
        where: { userId: knbtsStaff.userId },
      });
      if (scenario === "hospital staff cancel after expiry expires") {
        await prisma.questionnaireApproval.update({ where: { approvalId: approvalFixture.approval.approvalId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      }
      const hospitalStaff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
      const staffToken = jwt.sign({ userId: hospitalStaff.userId, role: "HOSPITAL_STAFF" }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
      const response = await request(app).patch(`/api/hospital/appointments/${booked.body.data.appointment.appointmentId}/status`)
        .set("Authorization", `Bearer ${staffToken}`).send({ status: "CANCELLED" });
      expect(response.status).toBe(200);
      return;
    }
    if (scenario === "successful completion consumes approval") {
      const booked = await book(fixture, slot);
      await prisma.appointment.update({ where: { appointmentId: booked.body.data.appointment.appointmentId }, data: { status: "CONFIRMED", date: new Date(Date.now() - 60000) } });
      const hospitalStaff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
      const staffToken = jwt.sign({ userId: hospitalStaff.userId, role: "HOSPITAL_STAFF" }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
      const response = await request(app).post(`/api/hospital/appointments/${booked.body.data.appointment.appointmentId}/donation`)
        .set("Authorization", `Bearer ${staffToken}`).send({ quantity: 450, notes: "Cleared" });
      expect(response.status).toBe(201);
      expect((await prisma.questionnaireApproval.findUnique({ where: { approvalId: approvalFixture.approval.approvalId } })).status).toBe("CONSUMED");
      expect(await prisma.notification.count({
        where: { userId: fixture.user.userId, type: "DONATION_COMPLETED" },
      })).toBe(1);
      expect(await prisma.emailOutbox.count({
        where: { recipientEmail: fixture.user.email, template: "DONATION_COMPLETED" },
      })).toBe(1);
      return;
    }
    if (scenario === "failed completion does not consume") {
      const booked = await book(fixture, slot);
      const hospitalStaff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
      const staffToken = jwt.sign({ userId: hospitalStaff.userId, role: "HOSPITAL_STAFF" }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
      const response = await request(app).post(`/api/hospital/appointments/${booked.body.data.appointment.appointmentId}/donation`)
        .set("Authorization", `Bearer ${staffToken}`).send({ quantity: 450 });
      expect(response.status).toBe(409);
      expect((await prisma.questionnaireApproval.findUnique({ where: { approvalId: approvalFixture.approval.approvalId } })).status).toBe("ACTIVE");
      expect(await prisma.smsOutbox.count({
        where: {
          recipientPhone: normalizeKenyanPhoneNumber(fixture.user.phone),
          eventKey: { startsWith: "donation-" },
        },
      })).toBe(0);
      return;
    }
    if (scenario === "cancelled appointment does not consume") {
      const booked = await book(fixture, slot);
      await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`);
      expect((await prisma.questionnaireApproval.findUnique({ where: { approvalId: approvalFixture.approval.approvalId } })).status).toBe("ACTIVE");
      return;
    }
    if (scenario === "concurrent cancellation and completion safe") {
      const booked = await book(fixture, slot);
      await prisma.appointment.update({ where: { appointmentId: booked.body.data.appointment.appointmentId }, data: { status: "CONFIRMED", date: new Date(Date.now() - 60000) } });
      const hospitalStaff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
      const staffToken = jwt.sign({ userId: hospitalStaff.userId, role: "HOSPITAL_STAFF" }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
      const responses = await Promise.all([
        request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`),
        request(app).post(`/api/hospital/appointments/${booked.body.data.appointment.appointmentId}/donation`).set("Authorization", `Bearer ${staffToken}`).send({ quantity: 450 }),
      ]);
      expect(responses.some((response) => [200, 201].includes(response.status))).toBe(true);
      return;
    }
    if (scenario === "active appointment blocks questionnaire draft") {
      await book(fixture, slot);
      expect((await createQuestionnaireDraft(fixture)).status).toBe(409);
      return;
    }
    if (scenario === "released appointment allows questionnaire draft") {
      const booked = await book(fixture, slot);
      await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`);
      expect((await createQuestionnaireDraft(fixture)).status).toBe(201);
      return;
    }
    if (scenario === "expired historical association allows questionnaire") {
      const booked = await book(fixture, slot);
      await prisma.questionnaireApproval.update({
        where: { approvalId: approvalFixture.approval.approvalId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`);
      expect((await createQuestionnaireDraft(fixture)).status).toBe(201);
      return;
    }
    if (scenario === "consumed historical association allows questionnaire") {
      const booked = await book(fixture, slot);
      await prisma.appointment.update({ where: { appointmentId: booked.body.data.appointment.appointmentId }, data: { status: "CONFIRMED", date: new Date(Date.now() - 60000) } });
      const hospitalStaff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
      const staffToken = jwt.sign({ userId: hospitalStaff.userId, role: "HOSPITAL_STAFF" }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
      const completion = await request(app).post(`/api/hospital/appointments/${booked.body.data.appointment.appointmentId}/donation`)
        .set("Authorization", `Bearer ${staffToken}`).send({ quantity: 450 });
      expect(completion.status).toBe(201);
      expect((await createQuestionnaireDraft(fixture)).status).toBe(201);
      return;
    }
    if (scenario === "consumed approval rejected" ||
        scenario === "approval exact expiry rejected" ||
        scenario === "expired approval rejected") {
      expect((await book(fixture, slot)).status).toBe(409);
      return;
    }

    const response = await book(fixture, slot);
    expect(response.status).toBe(201);
    if (scenario === "valid approval can book") {
      const appointment = response.body.data.appointment;
      const [notification, email, sms] = await Promise.all([
        prisma.notification.findFirst({
          where: { userId: fixture.user.userId, type: "APPOINTMENT_BOOKED" },
        }),
        prisma.emailOutbox.findFirst({
          where: { recipientEmail: fixture.user.email, template: "APPOINTMENT_BOOKED" },
        }),
        prisma.smsOutbox.findFirst({
          where: { eventKey: `appointment-${appointment.appointmentId}-booked:sms` },
        }),
      ]);
      expect(notification.message).toContain(`HC-${appointment.appointmentId}`);
      expect(notification.message).toContain(hospital.name);
      expect(notification.message).toContain(appointment.time);
      expect(email.payload).toEqual(expect.objectContaining({
        hospital: hospital.name,
        time: appointment.time,
        reference: `HC-${appointment.appointmentId}`,
      }));
      expect(sms).toBeNull();
      expect(await prisma.smsOutbox.count({
        where: { recipientPhone: `+254${fixture.user.phone.slice(1)}` },
      })).toBe(0);
      expect(await prisma.smsOutbox.count({
        where: { eventKey: `appointment-${appointment.appointmentId}-booked:sms` },
      })).toBe(0);
    }
  });

  it("queues one appointment SMS only after hospital staff accepts a donation booking", async () => {
    const fixture = await createDonor("hospital-accepted");
    await createApproval(fixture.donor);
    const slot = await createSlot();
    const booking = await book(fixture, slot);
    expect(booking.status).toBe(201);
    const appointment = booking.body.data.appointment;

    expect(await prisma.smsOutbox.count({
      where: { eventKey: `appointment-${appointment.appointmentId}-accepted:sms` },
    })).toBe(0);
    expect(await prisma.notification.count({
      where: { userId: fixture.user.userId, type: "APPOINTMENT_BOOKED" },
    })).toBe(1);
    expect(await prisma.emailOutbox.count({
      where: { recipientEmail: fixture.user.email, template: "APPOINTMENT_BOOKED" },
    })).toBe(1);

    const hospitalStaff = await prisma.hospitalStaff.findFirst({
      where: { hospitalId: hospital.hospitalId },
    });
    const hospitalToken = tokenFor({
      userId: hospitalStaff.userId,
      role: "HOSPITAL_STAFF",
    });
    const accepted = await request(app)
      .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
      .set("Authorization", `Bearer ${hospitalToken}`)
      .send({ status: "CONFIRMED" });
    expect(accepted.status).toBe(200);
    const acceptedSms = await prisma.smsOutbox.findUnique({
      where: { eventKey: `appointment-${appointment.appointmentId}-accepted:sms` },
    });
    expect(acceptedSms).toEqual(expect.objectContaining({
      recipientPhone: normalizeKenyanPhoneNumber(fixture.user.phone),
      status: "QUEUED",
    }));
    expect(acceptedSms.message).toContain(hospital.name);
    expect(acceptedSms.message).toContain(formatAppointmentDate(appointment.date));
    expect(acceptedSms.message).toContain(appointment.time);
    expect(acceptedSms.message).toContain("Please avail yourself");

    const repeatedAcceptance = await request(app)
      .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
      .set("Authorization", `Bearer ${hospitalToken}`)
      .send({ status: "CONFIRMED" });
    expect(repeatedAcceptance.status).toBe(409);
    expect(await prisma.smsOutbox.count({
      where: { eventKey: `appointment-${appointment.appointmentId}-accepted:sms` },
    })).toBe(1);

    const cancelled = await request(app)
      .patch(`/api/hospital/appointments/${appointment.appointmentId}/status`)
      .set("Authorization", `Bearer ${hospitalToken}`)
      .send({ status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    expect(await prisma.smsOutbox.count({
      where: {
        eventKey: {
          in: [
            `appointment-${appointment.appointmentId}-accepted:sms`,
            `appointment-${appointment.appointmentId}-cancelled:sms`,
          ],
        },
      },
    })).toBe(1);
    expect(await prisma.notification.count({
      where: { userId: fixture.user.userId, type: "APPOINTMENT_CANCELLED" },
    })).toBe(1);
    expect(await prisma.emailOutbox.count({
      where: { recipientEmail: fixture.user.email, template: "APPOINTMENT_CANCELLED" },
    })).toBe(1);
  });

  it("completes the KNBTS approval, appointment booking, and donation journey", async () => {
    const fixture = await createDonor("integrated-donor-journey");
    const latestVersion = await prisma.questionnaireVersion.findFirst({
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const version = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: (latestVersion?.versionNumber || 0) + 1,
        title: "Integrated donor journey fixture",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    questionnaireFixtureCleanup.trackVersion(version);
    const submission = await prisma.donorQuestionnaireSubmission.create({
      data: {
        donorId: fixture.donor.donorId,
        versionId: version.questionnaireVersionId,
        status: "PENDING",
        submittedAt: new Date(),
        declarationAcknowledgedAt: new Date(),
      },
    });
    questionnaireFixtureCleanup.trackSubmission(submission);
    artifactTracker.trackAudit({
      entityType: "DonorQuestionnaireSubmission",
      entityId: String(submission.submissionId),
    });
    const knbtsToken = tokenFor({ userId: knbtsStaff.userId, role: "KNBTS_STAFF" });

    const review = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "APPROVED" });
    expect(review.status).toBe(200);

    const assessment = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "ACCEPT", weightKg: 72.5, bloodPressure: "120/80" });
    expect(assessment.status).toBe(200);

    const issued = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/approval`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(issued.status).toBe(201);
    const approvalId = issued.body.data.approvalId;
    artifactTracker.trackAudit({
      entityType: "QuestionnaireApproval",
      entityId: String(approvalId),
    });
    const slot = await createSlot();
    const booking = await book(fixture, slot);
    expect(booking.status).toBe(201);

    const appointmentId = booking.body.data.appointment.appointmentId;
    artifactTracker.trackAudit({
      entityType: "Appointment",
      entityId: String(appointmentId),
    });
    const hospitalStaff = await prisma.hospitalStaff.findFirst({
      where: { hospitalId: hospital.hospitalId },
    });
    const hospitalToken = tokenFor({
      userId: hospitalStaff.userId,
      role: "HOSPITAL_STAFF",
    });
    await prisma.appointment.update({
      where: { appointmentId },
      data: { date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
    });
    const accepted = await request(app)
      .patch(`/api/hospital/appointments/${appointmentId}/status`)
      .set("Authorization", `Bearer ${hospitalToken}`)
      .send({ status: "CONFIRMED" });
    expect(accepted.status).toBe(200);
    const completion = await request(app)
      .post(`/api/hospital/appointments/${appointmentId}/donation`)
      .set("Authorization", `Bearer ${hospitalToken}`)
      .send({ quantity: 450, notes: "Integrated test completion" });

    expect(completion.status).toBe(201);
    expect(await prisma.questionnaireApproval.findUnique({ where: { approvalId } }))
      .toEqual(expect.objectContaining({ status: "CONSUMED" }));
    const donation = await prisma.donationRecord.findFirst({ where: { appointmentId } });
    expect(donation)
      .toEqual(expect.objectContaining({ quantity: 450, donorId: fixture.donor.donorId }));
    artifactTracker.trackAudit({
      entityType: "DonationRecord",
      entityId: String(donation.donationId),
    });
    const eligibility = getDonationEligibility({
      lastSuccessfulDonationDate: donation.donationDate,
    });
    const donationSms = await prisma.smsOutbox.findUnique({
      where: { eventKey: `donation-${donation.donationId}-completed:sms` },
    });
    expect(donationSms).toEqual(expect.objectContaining({
      recipientPhone: normalizeKenyanPhoneNumber(fixture.user.phone),
      status: "QUEUED",
    }));
    expect(donationSms.message).toContain(formatAppointmentDate(donation.donationDate));
    expect(donationSms.message).toContain(`${env.DONATION_WAITING_PERIOD_DAYS} days`);
    expect(donationSms.message).toContain(
      formatAppointmentDate(eligibility.nextEligibleDonationDate)
    );
    expect(await prisma.notification.count({
      where: {
        userId: fixture.user.userId,
        type: { in: ["QUESTIONNAIRE_APPROVED", "APPOINTMENT_BOOKED", "DONATION_COMPLETED"] },
      },
    })).toBe(3);
    expect(await prisma.smsOutbox.count({
      where: { eventKey: `appointment-${appointmentId}-booked:sms` },
    })).toBe(0);
    expect(await prisma.emailOutbox.count({
      where: {
        recipientEmail: fixture.user.email,
        template: { in: ["QUESTIONNAIRE_APPROVED", "APPOINTMENT_BOOKED", "DONATION_COMPLETED"] },
      },
    })).toBe(3);
    expect(await prisma.smsOutbox.count({
      where: {
        eventKey: {
          in: [
            `questionnaire-${submission.submissionId}-approved:sms`,
            `appointment-${appointmentId}-accepted:sms`,
            `donation-${donation.donationId}-completed:sms`,
          ],
        },
        status: "QUEUED",
      },
    })).toBe(3);

  });
});
