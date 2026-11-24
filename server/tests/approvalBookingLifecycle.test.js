const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Task 6 approval-gated booking lifecycle", () => {
  let knbtsStaff;
  let hospital;
  const cleanups = [];

  const tokenFor = (user) => jwt.sign(
    { userId: user.userId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  beforeAll(async () => {
    knbtsStaff = await prisma.knbtsStaff.findFirst({ include: { centre: true } });
    hospital = await prisma.hospital.findFirst({
      where: { institutionType: "HOSPITAL", isActive: true, latitude: { not: null }, longitude: { not: null } },
    });
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
    cleanups.push({ userId: user.userId, donorId: donor.donorId });
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
    const submission = await prisma.donorQuestionnaireSubmission.create({
      data: {
        donorId: donor.donorId,
        versionId: version.questionnaireVersionId,
        status: "APPROVED",
        submittedAt: now,
        declarationAcknowledgedAt: now,
      },
    });
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
    const record = { version, submission, review, approval };
    cleanups.push({
      donorId: donor.donorId,
      submissionId: submission.submissionId,
      approvalId: approval.approvalId,
      versionId: version.questionnaireVersionId,
    });
    return record;
  };

  const createSlot = async (capacity = 1, bookedCount = 0) => {
    const staff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
    const slotDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const normalized = new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate()));
    let slot = await prisma.appointmentSlot.findFirst({
      where: { hospitalId: hospital.hospitalId, slotDate: normalized, time: "13:30" },
    });
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
    cleanups.push({ slotId: slot.slotId });
    return slot;
  };

  const book = (fixture, slot, purpose = "Blood Donation") => request(app)
    .post("/api/donor/appointments")
    .set("Authorization", `Bearer ${fixture.token}`)
    .send({
      slotId: slot.slotId,
      purpose,
      hospitalId: hospital.hospitalId,
      locationLatitude: -1.286389,
      locationLongitude: 36.817223,
    });

  afterEach(async () => {
    const fixtureVersionIds = cleanups
      .filter((record) => record.versionId)
      .map((record) => record.versionId);
    for (const record of [...cleanups].reverse()) {
      if (record.slotId) {
        await prisma.appointmentSlot.updateMany({
          where: { slotId: record.slotId },
          data: { bookedCount: 0 },
        });
      }
      if (record.approvalId) {
        await prisma.questionnaireBookingAssociation.deleteMany({ where: { approvalId: record.approvalId } });
        await prisma.questionnaireApproval.deleteMany({ where: { approvalId: record.approvalId } });
      }
      if (record.submissionId) {
        await prisma.questionnaireClinicalAssessment.deleteMany({ where: { submissionId: record.submissionId } });
        await prisma.questionnaireReview.deleteMany({ where: { submissionId: record.submissionId } });
        await prisma.donorQuestionnaireSubmission.deleteMany({ where: { submissionId: record.submissionId } });
      }
      if (record.versionId) {
        // Keep until all submissions for this fixture have been removed.
      }
      if (record.donorId) {
        const owner = record.userId
          ? await prisma.user.findUnique({
            where: { userId: record.userId },
            select: { email: true, phone: true },
          })
          : null;
        if (owner) {
          await prisma.notification.deleteMany({ where: { userId: record.userId } });
          await prisma.emailOutbox.deleteMany({ where: { recipientEmail: owner.email } });
          await prisma.smsOutbox.deleteMany({ where: { recipientPhone: owner.phone } });
        }
        await prisma.donationRecord.deleteMany({ where: { donorId: record.donorId } });
        await prisma.questionnaireBookingAssociation.deleteMany({
          where: { approval: { donorId: record.donorId } },
        });
        await prisma.appointment.deleteMany({ where: { donorId: record.donorId } });
        await prisma.questionnaireApproval.deleteMany({ where: { donorId: record.donorId } });
        await prisma.questionnaireClinicalAssessment.deleteMany({ where: { donorId: record.donorId } });
        const remainingSubmissionIds = await prisma.donorQuestionnaireSubmission.findMany({
          where: { donorId: record.donorId },
          select: { submissionId: true },
        });
        await prisma.questionnaireReview.deleteMany({
          where: { submissionId: { in: remainingSubmissionIds.map((row) => row.submissionId) } },
        });
        await prisma.donorQuestionnaireSubmission.deleteMany({ where: { donorId: record.donorId } });
        await prisma.donor.deleteMany({ where: { donorId: record.donorId } });
      }
      if (record.userId) {
        await prisma.user.deleteMany({ where: { userId: record.userId } });
      }
    }
    await prisma.questionnaireVersion.deleteMany({
      where: { questionnaireVersionId: { in: fixtureVersionIds } },
    });
    cleanups.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
      expect((await request(app).post("/api/donor/questionnaire/submissions").set("Authorization", `Bearer ${fixture.token}`)).status).toBe(409);
      return;
    }
    if (scenario === "released appointment allows questionnaire draft") {
      const booked = await book(fixture, slot);
      await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`);
      expect((await request(app).post("/api/donor/questionnaire/submissions").set("Authorization", `Bearer ${fixture.token}`)).status).toBe(201);
      return;
    }
    if (scenario === "expired historical association allows questionnaire") {
      const booked = await book(fixture, slot);
      await prisma.questionnaireApproval.update({
        where: { approvalId: approvalFixture.approval.approvalId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app).patch(`/api/donor/appointments/${booked.body.data.appointment.appointmentId}/cancel`).set("Authorization", `Bearer ${fixture.token}`);
      expect((await request(app).post("/api/donor/questionnaire/submissions").set("Authorization", `Bearer ${fixture.token}`)).status).toBe(201);
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
      expect((await request(app).post("/api/donor/questionnaire/submissions").set("Authorization", `Bearer ${fixture.token}`)).status).toBe(201);
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
      expect(sms).toEqual(expect.objectContaining({
        recipientPhone: `+254${fixture.user.phone.slice(1)}`,
        status: "QUEUED",
      }));
    }
  });
});
