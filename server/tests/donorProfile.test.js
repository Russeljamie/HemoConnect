const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Donor profile API", () => {
  let donorToken;
  let donorUser;

  beforeAll(async () => {
    donorUser = await prisma.user.findUnique({
      where: { email: "donor1@hemoconnect.co.ke" },
      include: { donor: true },
    });

    donorToken = jwt.sign(
      { userId: donorUser.userId, role: donorUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("returns a donor summary and donation history for the authenticated donor", async () => {
    const response = await request(app)
      .get("/api/donor/profile")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe("DONOR");
    expect(response.body.data.user.birthDate).toEqual(expect.any(String));
    expect(response.body.data.user).not.toHaveProperty("age");
    expect(response.body.data.metrics).toHaveProperty("totalDonations");
    expect(Array.isArray(response.body.data.donationHistory)).toBe(true);

    const donationCount = await prisma.donationRecord.count({
      where: { donorId: donorUser.donor.donorId },
    });
    expect(response.body.data.metrics.totalDonations).toBe(donationCount);
    expect(response.body.data.metrics).not.toHaveProperty("rewardPoints");
    expect(response.body.data.user).not.toHaveProperty("points");
    expect(response.body.data.user).toHaveProperty("nextEligibleDonationDate");
    expect(response.body.data.user).toHaveProperty("canScheduleDonation");
  });

  it("loads every donor dashboard data source successfully", async () => {
    const responses = await Promise.all([
      request(app).get("/api/donor/profile"),
      request(app).get("/api/donor/alerts"),
    ].map((pendingRequest) => pendingRequest.set("Authorization", `Bearer ${donorToken}`)));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  });

  it("returns only the authenticated donor's complete donation history", async () => {
    const response = await request(app)
      .get("/api/donor/donations?page=1&pageSize=100")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.donations.length).toBeGreaterThan(0);
    expect(response.body.data.donations[0]).not.toHaveProperty("rewardPoints");
    const donationIds = response.body.data.donations.map((donation) => donation.donationId);
    const ownedDonations = await prisma.donationRecord.findMany({
      where: { donorId: donorUser.donor.donorId },
      select: { donationId: true },
    });
    expect(donationIds.sort()).toEqual(ownedDonations.map(({ donationId }) => donationId).sort());

    const detailResponse = await request(app)
      .get(`/api/donor/donations/${donationIds[0]}`)
      .set("Authorization", `Bearer ${donorToken}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.donation).not.toHaveProperty("rewardPoints");
  });

  it("does not expose another donor's donation detail", async () => {
    const otherDonation = await prisma.donationRecord.findFirst({
      where: { donorId: { not: donorUser.donor.donorId } },
      select: { donationId: true },
    });

    if (!otherDonation) return;

    const response = await request(app)
      .get(`/api/donor/donations/${otherDonation.donationId}`)
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(404);
  });

  it("does not allow a donor to cancel another donor's appointment", async () => {
    const otherDonor = await prisma.donor.findFirst({
      where: { donorId: { not: donorUser.donor.donorId } },
      select: { donorId: true },
    });
    const hospital = await prisma.hospital.findFirst({
      where: { isActive: true, institutionType: "HOSPITAL" },
      select: { hospitalId: true },
    });
    if (!otherDonor || !hospital) return;

    const appointment = await prisma.appointment.create({
      data: {
        donorId: otherDonor.donorId,
        hospitalId: hospital.hospitalId,
        date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        time: "11:00",
        purpose: "Blood Donation",
        status: "SCHEDULED",
      },
    });

    try {
      const response = await request(app)
        .patch(`/api/donor/appointments/${appointment.appointmentId}/cancel`)
        .set("Authorization", `Bearer ${donorToken}`);
      expect(response.status).toBe(404);

      const unchanged = await prisma.appointment.findUnique({
        where: { appointmentId: appointment.appointmentId },
        select: { status: true },
      });
      expect(unchanged.status).toBe("SCHEDULED");
    } finally {
      await prisma.appointment.delete({ where: { appointmentId: appointment.appointmentId } });
    }
  });

  it("validates and updates donor profile details", async () => {
    const originalDonor = await prisma.donor.findUnique({
      where: { userId: donorUser.userId },
    });

    try {
      const today = new Date();
      const exact18BirthDate = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
      const invalidResponse = await request(app)
        .patch("/api/donor/profile")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({ birthDate: exact18BirthDate.toISOString().slice(0, 10) });
      expect(invalidResponse.status).toBe(400);

      const response = await request(app)
        .patch("/api/donor/profile")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          firstName: "Updated",
          lastName: "Donor",
          email: donorUser.email,
          phone: donorUser.phone,
          bloodType: originalDonor.bloodType,
          birthDate: originalDonor.birthDate.toISOString().slice(0, 10),
          gender: originalDonor.gender,
          address: originalDonor.address,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user.firstName).toBe("Updated");
    } finally {
      await prisma.user.update({
        where: { userId: donorUser.userId },
        data: { firstName: donorUser.firstName, lastName: donorUser.lastName },
      });
      await prisma.donor.update({
        where: { donorId: originalDonor.donorId },
        data: {
          firstName: originalDonor.firstName,
          lastName: originalDonor.lastName,
          gender: originalDonor.gender,
        },
      });
    }
  });

  it("books and cancels an appointment for the authenticated donor", async () => {
    const latitude = -1.286389;
    const longitude = 36.817223;
    const nearbyResponse = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude, longitude })
      .set("Authorization", `Bearer ${donorToken}`);
    expect(nearbyResponse.status).toBe(200);
    const hospital = nearbyResponse.body.data.hospitals[0];
    if (!hospital) return;

    const date = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const staff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
    if (!staff) return;
    const slot = await prisma.appointmentSlot.create({
      data: {
        hospitalId: hospital.hospitalId,
        createdByStaffId: staff.staffId,
        slotDate: new Date(`${date}T00:00:00.000Z`),
        time: "10:00",
        capacity: 1,
      },
    });

    const response = await request(app)
      .post("/api/donor/appointments")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        slotId: slot.slotId,
        purpose: "Blood Donation",
        hospitalId: hospital.hospitalId,
        locationLatitude: latitude,
        locationLongitude: longitude,
      });

    expect(response.status).toBe(201);
    const appointmentId = response.body.data.appointment.appointmentId;

    try {
      const fullSlotResponse = await request(app)
        .post("/api/donor/appointments")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          slotId: slot.slotId,
          purpose: "Blood Donation",
          hospitalId: hospital.hospitalId,
          locationLatitude: latitude,
          locationLongitude: longitude,
        });
      expect(fullSlotResponse.status).toBe(409);

      const cancelResponse = await request(app)
        .patch(`/api/donor/appointments/${appointmentId}/cancel`)
        .set("Authorization", `Bearer ${donorToken}`);
      expect(cancelResponse.status).toBe(200);
      expect((await prisma.appointmentSlot.findUnique({ where: { slotId: slot.slotId } })).bookedCount).toBe(0);

      const appointment = await prisma.appointment.findUnique({
        where: { appointmentId },
        select: { status: true },
      });
      expect(appointment.status).toBe("CANCELLED");
    } finally {
      await prisma.appointment.delete({ where: { appointmentId } });
      await prisma.appointmentSlot.delete({ where: { slotId: slot.slotId } });
    }
  });

  it("uses the 90-day interval to block early donation bookings", async () => {
    const latitude = -1.286389;
    const longitude = 36.817223;
    const nearbyResponse = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude, longitude })
      .set("Authorization", `Bearer ${donorToken}`);
    expect(nearbyResponse.status).toBe(200);
    const hospital = nearbyResponse.body.data.hospitals[0];
    if (!hospital) return;

    const staff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
    if (!staff) return;
    const slotDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const slot = await prisma.appointmentSlot.create({
      data: {
        hospitalId: hospital.hospitalId,
        createdByStaffId: staff.staffId,
        slotDate: new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate())),
        time: "09:15",
        capacity: 2,
      },
    });
    const originalDonor = await prisma.donor.findUnique({
      where: { donorId: donorUser.donor.donorId },
      select: { lastDonationDate: true },
    });
    let donationId;
    let appointmentId;
    let qualifyingAppointmentId;

    try {
      await prisma.donor.update({
        where: { donorId: donorUser.donor.donorId },
        data: { lastDonationDate: new Date("2035-01-01T00:00:00.000Z") },
      });
      const qualifyingAppointment = await prisma.appointment.create({
        data: {
          date: new Date(Date.now() - 24 * 60 * 60 * 1000),
          time: "08:30",
          purpose: "Blood Donation",
          status: "COMPLETED",
          donorId: donorUser.donor.donorId,
          hospitalId: hospital.hospitalId,
        },
      });
      qualifyingAppointmentId = qualifyingAppointment.appointmentId;
      const donation = await prisma.donationRecord.create({
        data: {
          donationDate: new Date(),
          bloodType: donorUser.donor.bloodType,
          quantity: 450,
          status: "AVAILABLE",
          donorId: donorUser.donor.donorId,
          appointmentId: qualifyingAppointmentId,
        },
      });
      donationId = donation.donationId;

      for (const cacheDate of [
        new Date("2035-01-01T00:00:00.000Z"),
        new Date("2000-01-01T00:00:00.000Z"),
        null,
      ]) {
        await prisma.donor.update({
          where: { donorId: donorUser.donor.donorId },
          data: { lastDonationDate: cacheDate },
        });
        const profileResponse = await request(app)
          .get("/api/donor/profile")
          .set("Authorization", `Bearer ${donorToken}`);
        expect(profileResponse.status).toBe(200);
        expect(new Date(profileResponse.body.data.user.lastSuccessfulDonationDate).toISOString().slice(0, 10))
          .toBe(donation.donationDate.toISOString().slice(0, 10));
      }

      await prisma.donor.update({
        where: { donorId: donorUser.donor.donorId },
        data: { lastDonationDate: new Date("2035-01-01T00:00:00.000Z") },
      });

      const slotBefore = await prisma.appointmentSlot.findUnique({ where: { slotId: slot.slotId } });
      expect(slotBefore.bookedCount).toBe(0);

      const donationResponse = await request(app)
        .post("/api/donor/appointments")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          slotId: slot.slotId,
          purpose: "Blood Donation",
          hospitalId: hospital.hospitalId,
          locationLatitude: latitude,
          locationLongitude: longitude,
        });
      expect(donationResponse.status).toBe(409);
      expect(donationResponse.body.message).toMatch(/schedule another blood donation from/);

      const slotAfter = await prisma.appointmentSlot.findUnique({ where: { slotId: slot.slotId } });
      expect(slotAfter.bookedCount).toBe(0);

      const testAppointmentResponse = await request(app)
        .post("/api/donor/appointments")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          slotId: slot.slotId,
          purpose: "Blood Test",
          hospitalId: hospital.hospitalId,
          locationLatitude: latitude,
          locationLongitude: longitude,
        });
      expect(testAppointmentResponse.status).toBe(201);
      appointmentId = testAppointmentResponse.body.data.appointment.appointmentId;
    } finally {
      if (appointmentId) await prisma.appointment.delete({ where: { appointmentId } });
      if (donationId) await prisma.donationRecord.delete({ where: { donationId } });
      if (qualifyingAppointmentId) await prisma.appointment.delete({ where: { appointmentId: qualifyingAppointmentId } });
      await prisma.appointmentSlot.delete({ where: { slotId: slot.slotId } });
      await prisma.donor.update({
        where: { donorId: donorUser.donor.donorId },
        data: { lastDonationDate: originalDonor.lastDonationDate },
      });
    }
  });

  it("rejects an age-ineligible booking without reserving slot capacity or creating an appointment", async () => {
    const latitude = -1.286389;
    const longitude = 36.817223;
    const nearbyResponse = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude, longitude })
      .set("Authorization", `Bearer ${donorToken}`);
    expect(nearbyResponse.status).toBe(200);
    const hospital = nearbyResponse.body.data.hospitals[0];
    if (!hospital) return;

    const staff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
    if (!staff) return;
    const slotDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const slot = await prisma.appointmentSlot.create({
      data: {
        hospitalId: hospital.hospitalId,
        createdByStaffId: staff.staffId,
        slotDate: new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate())),
        time: "10:45",
        capacity: 1,
      },
    });

    const originalDonor = await prisma.donor.findUnique({
      where: { donorId: donorUser.donor.donorId },
      select: { birthDate: true },
    });

    try {
      const today = new Date();
      const exact18BirthDate = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
      await prisma.donor.update({
        where: { donorId: donorUser.donor.donorId },
        data: { birthDate: exact18BirthDate },
      });

      const response = await request(app)
        .post("/api/donor/appointments")
        .set("Authorization", `Bearer ${donorToken}`)
        .send({
          slotId: slot.slotId,
          purpose: "Blood Donation",
          hospitalId: hospital.hospitalId,
          locationLatitude: latitude,
          locationLongitude: longitude,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/older than 18/);
      expect((await prisma.appointmentSlot.findUnique({ where: { slotId: slot.slotId } })).bookedCount).toBe(0);
      expect(await prisma.appointment.count({
        where: { slotId: slot.slotId, donorId: donorUser.donor.donorId },
      })).toBe(0);
    } finally {
      await prisma.donor.update({
        where: { donorId: donorUser.donor.donorId },
        data: { birthDate: originalDonor.birthDate },
      });
      await prisma.appointmentSlot.delete({ where: { slotId: slot.slotId } });
    }
  });

  it("allows blood donation booking with no qualifying record even if cache exists", async () => {
    const latitude = -1.286389;
    const longitude = 36.817223;
    const email = `no-record-${Date.now()}@hemoconnect.co.ke`;
    let isolatedUser;
    let isolatedDonor;
    let isolatedToken;
    let slot;
    let appointmentId;

    try {
      isolatedUser = await prisma.user.create({
        data: {
          firstName: "No",
          lastName: "Record",
          email,
          phone: "0790000099",
          password: "test-only-password",
          role: "DONOR",
          status: "ACTIVE",
        },
      });
      isolatedDonor = await prisma.donor.create({
        data: {
          firstName: "No",
          lastName: "Record",
          bloodType: "O+",
          birthDate: new Date("1996-05-10T00:00:00.000Z"),
          gender: "OTHER",
          address: "Nairobi",
          latitude,
          longitude,
          lastDonationDate: new Date("2035-01-01T00:00:00.000Z"),
          userId: isolatedUser.userId,
        },
      });
      isolatedToken = jwt.sign(
        { userId: isolatedUser.userId, role: "DONOR" },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      const nearbyResponse = await request(app)
        .get("/api/donor/appointments/nearby")
        .query({ latitude, longitude })
        .set("Authorization", `Bearer ${isolatedToken}`);
      expect(nearbyResponse.status).toBe(200);
      const hospital = nearbyResponse.body.data.hospitals[0];
      if (!hospital) return;

      const staff = await prisma.hospitalStaff.findFirst({ where: { hospitalId: hospital.hospitalId } });
      if (!staff) return;
      const slotDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      slot = await prisma.appointmentSlot.create({
        data: {
          hospitalId: hospital.hospitalId,
          createdByStaffId: staff.staffId,
          slotDate: new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate())),
          time: "11:45",
          capacity: 1,
        },
      });

      const profileResponse = await request(app)
        .get("/api/donor/profile")
        .set("Authorization", `Bearer ${isolatedToken}`);
      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.data.user.lastSuccessfulDonationDate).toBeNull();

      const response = await request(app)
        .post("/api/donor/appointments")
        .set("Authorization", `Bearer ${isolatedToken}`)
        .send({
          slotId: slot.slotId,
          purpose: "Blood Donation",
          hospitalId: hospital.hospitalId,
          locationLatitude: latitude,
          locationLongitude: longitude,
        });
      expect(response.status).toBe(201);
      appointmentId = response.body.data.appointment.appointmentId;
    } finally {
      if (appointmentId) await prisma.appointment.delete({ where: { appointmentId } });
      if (slot) await prisma.appointmentSlot.delete({ where: { slotId: slot.slotId } });
      if (isolatedUser) await prisma.user.delete({ where: { userId: isolatedUser.userId } });
    }
  });

  it("does not allow booking at a hospital outside the three closest", async () => {
    const latitude = -1.286389;
    const longitude = 36.817223;
    const nearbyResponse = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude, longitude })
      .set("Authorization", `Bearer ${donorToken}`);
    const nearestIds = nearbyResponse.body.data.hospitals.map((hospital) => hospital.hospitalId);
    const otherHospital = (await prisma.hospital.findMany({
      where: {
        isActive: true,
        latitude: { not: null },
        longitude: { not: null },
        hospitalId: { notIn: nearestIds },
      },
      select: { hospitalId: true },
      take: 1,
    }))[0];
    if (!otherHospital) return;

    const date = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await request(app)
      .post("/api/donor/appointments")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        slotId: 1,
        purpose: "Blood Donation",
        hospitalId: otherHospital.hospitalId,
        locationLatitude: latitude,
        locationLongitude: longitude,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/three closest active hospitals/i);
  });

  it("returns the three closest confirmed hospitals with coordinates", async () => {
    const response = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude: -1.286389, longitude: 36.817223 })
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.hospitals).toHaveLength(3);
    expect(response.body.data.hospitals.every((hospital) =>
      Number.isFinite(hospital.latitude) &&
      Number.isFinite(hospital.longitude) &&
      Number.isFinite(hospital.distanceKm)
    )).toBe(true);
    expect(response.body.data.hospitals.map((hospital) => hospital.distanceKm))
      .toEqual([...response.body.data.hospitals.map((hospital) => hospital.distanceKm)].sort((a, b) => a - b));
  });

  it("rejects invalid coordinates for nearby hospital search", async () => {
    const response = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude: 91, longitude: 0 })
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(400);
  });

  it("returns emergency requests matching the donor's blood type", async () => {
    const response = await request(app)
      .get("/api/donor/alerts")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.alerts)).toBe(true);
    const compatibleTypes = {
      "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
      "O+": ["O+", "A+", "B+", "AB+"],
      "A-": ["A-", "A+", "AB-", "AB+"],
      "A+": ["A+", "AB+"],
      "B-": ["B-", "B+", "AB-", "AB+"],
      "B+": ["B+", "AB+"],
      "AB-": ["AB-", "AB+"],
      "AB+": ["AB+"],
    };
    expect(response.body.data.alerts.every((alert) =>
      compatibleTypes[donorUser.donor.bloodType].includes(alert.bloodType)
    )).toBe(true);
  });

  it("rejects non-donor roles from donor endpoints", async () => {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@hemoconnect.co.ke" },
      select: { userId: true, role: true },
    });
    const adminToken = jwt.sign(
      { userId: adminUser.userId, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const responses = await Promise.all([
      request(app).get("/api/donor/profile"),
      request(app).get("/api/donor/donations"),
      request(app).get("/api/donor/appointments"),
      request(app).get("/api/donor/alerts"),
      request(app).post("/api/donor/alerts/1/respond").send({ response: "ACCEPT" }),
    ].map((pendingRequest) => pendingRequest.set("Authorization", `Bearer ${adminToken}`)));

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
  });

  it("keeps donor registration and login working", async () => {
    const email = `donor-test-${Date.now()}@hemoconnect.co.ke`;
    const today = new Date();
    const exact18BirthDate = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));

    const exact18Registration = await request(app).post("/api/auth/register").send({
      firstName: "Exact",
      lastName: "Eighteen",
      email: `exact18-${Date.now()}@hemoconnect.co.ke`,
      phone: "0790000002",
      password: "Password123!",
      role: "DONOR",
      bloodType: "O+",
      birthDate: exact18BirthDate.toISOString().slice(0, 10),
      gender: "OTHER",
      address: "Nairobi",
    });
    expect(exact18Registration.status).toBe(400);

    const userData = {
      firstName: "Test",
      lastName: "Donor",
      email,
      phone: "0790000001",
      password: "Password123!",
      role: "DONOR",
      bloodType: "O+",
      birthDate: "1996-05-10",
      gender: "OTHER",
      address: "Nairobi",
    };

    try {
      const registration = await request(app).post("/api/auth/register").send(userData);
      expect(registration.status).toBe(201);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password: userData.password });
      expect(login.status).toBe(200);
      expect(login.body.data.token).toEqual(expect.any(String));
      expect(login.body.data.user.role).toBe("DONOR");
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });
});
