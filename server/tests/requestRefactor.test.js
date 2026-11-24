const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");
const { renderEmailTemplate } = require("../services/email");
const { normalizeKenyanPhoneNumber } = require("../services/sms");

describe("Patient-independent hospital request refactor", () => {
  let staffUser;
  let staffProfile;
  let donorUser;
  let staffToken;
  let donorToken;

  beforeAll(async () => {
    staffUser = await prisma.user.findUnique({ where: { email: "staff1@hemoconnect.co.ke" } });
    staffProfile = await prisma.hospitalStaff.findUnique({ where: { userId: staffUser.userId } });
    donorUser = await prisma.user.findUnique({
      where: { email: "donor1@hemoconnect.co.ke" },
      include: { donor: true },
    });

    staffToken = jwt.sign(
      { userId: staffUser.userId, role: staffUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    donorToken = jwt.sign(
      { userId: donorUser.userId, role: donorUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("rejects and trims patientReference with the required length boundary", async () => {
    const basePayload = {
      bloodType: "O+",
      quantityRequired: 1,
      urgencyLevel: "MEDIUM",
      neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: staffProfile.hospitalId ? undefined : undefined,
    };

    const tooLong = await request(app)
      .post("/api/hospital/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...basePayload, patientReference: "R".repeat(61) });
    expect(tooLong.status).toBe(400);

    const shortReference = `WARD-${Date.now()}`;
    const created = await request(app)
      .post("/api/hospital/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ ...basePayload, patientReference: `  ${shortReference}  ` });

    expect(created.status).toBe(201);
    expect(created.body.data.request.patientReference).toBe(shortReference);

    await prisma.emergencyRequest.delete({ where: { requestId: created.body.data.request.requestId } });
  });

  it("rejects patientId and patient detail payload fields", async () => {
    const payload = {
      bloodType: "O+",
      quantityRequired: 1,
      urgencyLevel: "MEDIUM",
      neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      patientId: 123,
      patient: { firstName: "Removed", lastName: "Patient", phone: "07123456789" },
    };

    const response = await request(app)
      .post("/api/hospital/requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(payload);

    expect(response.status).toBe(400);
  });

  it("rejects PATIENT registration and login", async () => {
    const registration = await request(app).post("/api/auth/register").send({
      firstName: "Removed",
      lastName: "Patient",
      email: `patient-role-${Date.now()}@hemoconnect.test`,
      phone: "07123456789",
      password: "Password123!",
      role: "PATIENT",
    });
    expect(registration.status).toBe(400);

    const email = `patient-login-${Date.now()}@hemoconnect.test`;
    const password = "PatientPassword123!";
    const patientUser = await prisma.user.create({
      data: {
        firstName: "Removed",
        lastName: "Patient",
        email,
        phone: "07123456789",
        password: await bcrypt.hash(password, 12),
        role: "PATIENT",
        status: "ACTIVE",
      },
    });

    try {
      const login = await request(app).post("/api/auth/login").send({ email, password });
      expect(login.status).toBe(403);
    } finally {
      await prisma.user.delete({ where: { userId: patientUser.userId } });
    }
  });

  it("creates, matches, accepts and fulfills a patient-independent request while decreasing stock", async () => {
    const hospital = await prisma.hospital.findUnique({
      where: { hospitalId: staffProfile.hospitalId },
      select: { latitude: true, longitude: true },
    });
    const inventory = await prisma.bloodInventory.findUnique({
      where: { hospitalId_bloodType: { hospitalId: staffProfile.hospitalId, bloodType: "O+" } },
    });
    const originalUnits = inventory?.unitsAvailable ?? 0;

    if (inventory) {
      await prisma.bloodInventory.update({
        where: { inventoryId: inventory.inventoryId },
        data: { unitsAvailable: 5 },
      });
    } else {
      await prisma.bloodInventory.create({
        data: { hospitalId: staffProfile.hospitalId, bloodType: "O+", unitsAvailable: 5, minimumUnits: 1 },
      });
    }

    let requestId;
    try {
      const created = await request(app)
        .post("/api/hospital/requests")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          bloodType: "O+",
          quantityRequired: 2,
          urgencyLevel: "HIGH",
          neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          latitude: hospital.latitude,
          longitude: hospital.longitude,
          patientReference: "WARD-REF-42",
        });

      expect(created.status).toBe(201);
      requestId = created.body.data.request.requestId;

      const saved = await prisma.emergencyRequest.findUnique({ where: { requestId } });
      expect(saved.createdByStaffId).toBe(staffProfile.staffId);
      expect(saved.requestedByUserId).toBe(staffUser.userId);
      expect(saved.patientReference).toBe("WARD-REF-42");

      const matches = await prisma.requestMatch.findMany({
        where: { requestId },
        include: {
          donor: {
            select: {
              userId: true,
              user: { select: { email: true, phone: true } },
            },
          },
        },
      });
      expect(matches.length).toBeGreaterThan(0);
      for (const matchedDonor of matches) {
        const [notification, sms, email] = await Promise.all([
          prisma.notification.findFirst({
            where: { requestId, userId: matchedDonor.donor.userId, type: "EMERGENCY_BLOOD_REQUEST" },
          }),
          prisma.smsOutbox.findUnique({
            where: { eventKey: `emergency-${requestId}-donor-${matchedDonor.donorId}:sms` },
          }),
          prisma.emailOutbox.findFirst({
            where: { recipientEmail: matchedDonor.donor.user.email, template: "DONOR_EMERGENCY_ALERT" },
          }),
        ]);
        expect(notification).not.toBeNull();
        expect(email).not.toBeNull();
        if (normalizeKenyanPhoneNumber(matchedDonor.donor.user.phone)) {
          expect(sms.recipientPhone).toBe(normalizeKenyanPhoneNumber(matchedDonor.donor.user.phone));
        } else {
          expect(sms.status).toBe("FAILED");
        }
      }

      const accepted = await request(app)
        .post(`/api/donor/alerts/${requestId}/respond`)
        .set("Authorization", `Bearer ${donorToken}`)
        .send({ response: "ACCEPT" });
      expect(accepted.status).toBe(200);

      const beforeFulfillment = await prisma.bloodInventory.findUnique({
        where: { hospitalId_bloodType: { hospitalId: staffProfile.hospitalId, bloodType: "O+" } },
      });

      const fulfilled = await request(app)
        .post(`/api/hospital/requests/${requestId}/fulfill`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ quantity: 2, outcomeNotes: "Refactor verification fulfillment" });
      expect(fulfilled.status).toBe(200);

      const afterFulfillment = await prisma.bloodInventory.findUnique({
        where: { hospitalId_bloodType: { hospitalId: staffProfile.hospitalId, bloodType: "O+" } },
      });
      expect(afterFulfillment.unitsAvailable).toBe(beforeFulfillment.unitsAvailable - 2);
    } finally {
      if (requestId) {
        const matches = await prisma.requestMatch.findMany({
          where: { requestId },
          include: { donor: { select: { user: { select: { email: true } } } } },
        });
        await prisma.smsOutbox.deleteMany({ where: { eventKey: { startsWith: `emergency-${requestId}-` } } });
        await prisma.emailOutbox.deleteMany({
          where: {
            recipientEmail: { in: matches.map(({ donor }) => donor.user.email) },
            template: "DONOR_EMERGENCY_ALERT",
          },
        });
        await prisma.emergencyRequest.delete({ where: { requestId } });
      }
      const restoredInventory = await prisma.bloodInventory.findUnique({
        where: { hospitalId_bloodType: { hospitalId: staffProfile.hospitalId, bloodType: "O+" } },
      });
      if (restoredInventory) {
        await prisma.bloodInventory.update({
          where: { inventoryId: restoredInventory.inventoryId },
          data: { unitsAvailable: originalUnits },
        });
      }
    }
  });

  it("uses donor notifications and email templates without patient information", async () => {
    const alert = await prisma.notification.create({
      data: {
        type: "EMERGENCY_BLOOD_REQUEST",
        channel: "IN_APP",
        title: "Nearby blood request",
        message: "O+ blood is needed nearby (2.5 km).",
        status: "SENT",
        sentAt: new Date(),
        userId: donorUser.userId,
      },
    });

    try {
      const notificationText = `${alert.title} ${alert.message}`.toLowerCase();
      expect(notificationText).not.toMatch(/patient|name|phone|ward|case reference/);

      const email = renderEmailTemplate("DONOR_EMERGENCY_ALERT", {
        name: donorUser.firstName,
        requestId: 123,
        bloodType: "O+",
        urgency: "HIGH",
        distanceKm: 2.5,
        neededBy: new Date(),
        hospital: "Test Hospital",
      });
      const emailText = `${email.subject} ${email.text} ${email.html}`.toLowerCase();
      expect(emailText).not.toMatch(/patient|phone|ward|case reference/);
    } finally {
      await prisma.notification.delete({ where: { notificationId: alert.notificationId } });
    }
  });
});
