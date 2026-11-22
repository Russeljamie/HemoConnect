const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Admin hospital staff account management", () => {
  let adminUser;
  let adminToken;
  let hospital;

  beforeAll(async () => {
    [adminUser, hospital] = await Promise.all([
      prisma.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } }),
      prisma.hospital.findFirst({ where: { isActive: true }, orderBy: { hospitalId: "asc" } }),
    ]);
    adminToken = jwt.sign(
      { userId: adminUser.userId, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("creates a hospital-scoped staff account and requires a password change before access", async () => {
    const email = `admin-staff-${Date.now()}@hemoconnect.test`;
    const temporaryPassword = "TempPassword-2026!";
    let userId;
    let staffId;

    try {
      const createResponse = await request(app)
        .post("/api/admin/hospital-staff")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          firstName: "Hospital",
          lastName: "Staff",
          email,
          phone: "07123456789",
          designation: "Blood Bank Officer",
          hospitalId: hospital.hospitalId,
          temporaryPassword,
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.staff.hospital.hospitalId).toBe(hospital.hospitalId);
      expect(createResponse.body.data.staff.user.mustChangePassword).toBe(true);
      expect(createResponse.body.data.staff.user.password).toBeUndefined();
      userId = createResponse.body.data.staff.user.userId;
      staffId = createResponse.body.data.staff.staffId;

      const storedUser = await prisma.user.findUnique({
        where: { userId },
        include: { hospitalStaff: true },
      });
      expect(storedUser.hospitalStaff.hospitalId).toBe(hospital.hospitalId);
      expect(storedUser.password).not.toBe(temporaryPassword);
      expect(storedUser.mustChangePassword).toBe(true);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email, password: temporaryPassword });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.data.user.mustChangePassword).toBe(true);

      const blockedResponse = await request(app)
        .get("/api/hospital/profile")
        .set("Authorization", `Bearer ${loginResponse.body.data.token}`);
      expect(blockedResponse.status).toBe(403);
      expect(blockedResponse.body.code).toBe("PASSWORD_CHANGE_REQUIRED");

      const passwordResponse = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${loginResponse.body.data.token}`)
        .send({ currentPassword: temporaryPassword, newPassword: "A-strong-new-password-2026" });
      expect(passwordResponse.status).toBe(200);
      expect(passwordResponse.body.data.user.mustChangePassword).toBe(false);

      const profileResponse = await request(app)
        .get("/api/hospital/profile")
        .set("Authorization", `Bearer ${passwordResponse.body.data.token}`);
      expect(profileResponse.status).toBe(200);
    } finally {
      if (staffId) {
        await prisma.auditLog.deleteMany({
          where: { entityType: "HospitalStaff", entityId: String(staffId) },
        });
        await prisma.hospitalStaff.delete({ where: { staffId } });
      }
      if (userId) {
        await prisma.auditLog.deleteMany({
          where: { entityType: "User", entityId: String(userId) },
        });
        await prisma.user.delete({ where: { userId } });
      }
    }
  });

  it("does not allow non-admin users to create hospital staff accounts", async () => {
    const donor = await prisma.user.findFirst({
      where: { role: "DONOR", status: "ACTIVE" },
      select: { userId: true, role: true },
    });
    const donorToken = jwt.sign(
      { userId: donor.userId, role: donor.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const response = await request(app)
      .post("/api/admin/hospital-staff")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({});

    expect(response.status).toBe(403);

    const hospitalResponse = await request(app)
      .post("/api/admin/hospitals")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({});
    expect(hospitalResponse.status).toBe(403);
  });

  it("adds a pinned hospital to the database and nearby appointment search", async () => {
    const hospitalData = {
      name: `Directory test hospital ${Date.now()}`,
      location: "Nairobi test location",
      contactInfo: "07123456789",
      latitude: -1.286389,
      longitude: 36.817223,
    };
    let hospitalId;

    try {
      const createResponse = await request(app)
        .post("/api/admin/hospitals")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(hospitalData);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.hospital).toEqual(expect.objectContaining({
        name: hospitalData.name,
        location: hospitalData.location,
        latitude: hospitalData.latitude,
        longitude: hospitalData.longitude,
        isActive: true,
      }));
      hospitalId = createResponse.body.data.hospital.hospitalId;

      const storedHospital = await prisma.hospital.findUnique({ where: { hospitalId } });
      expect(storedHospital.latitude).toBe(hospitalData.latitude);
      expect(storedHospital.longitude).toBe(hospitalData.longitude);

      const donor = await prisma.user.findFirst({
        where: { role: "DONOR", status: "ACTIVE" },
        select: { userId: true, role: true },
      });
      const donorToken = jwt.sign(
        { userId: donor.userId, role: donor.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );
      const nearbyResponse = await request(app)
        .get("/api/donor/appointments/nearby")
        .query({ latitude: hospitalData.latitude, longitude: hospitalData.longitude })
        .set("Authorization", `Bearer ${donorToken}`);

      expect(nearbyResponse.status).toBe(200);
      expect(nearbyResponse.body.data.hospitals[0]).toEqual(expect.objectContaining({
        hospitalId,
        distanceKm: 0,
      }));

      const duplicateResponse = await request(app)
        .post("/api/admin/hospitals")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(hospitalData);
      expect(duplicateResponse.status).toBe(409);

      const invalidCoordinatesResponse = await request(app)
        .post("/api/admin/hospitals")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...hospitalData, latitude: 91 });
      expect(invalidCoordinatesResponse.status).toBe(400);
    } finally {
      if (hospitalId) await prisma.hospital.delete({ where: { hospitalId } });
    }
  });
});
