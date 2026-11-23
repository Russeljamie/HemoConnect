const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("Role-based access control", () => {
  let donorToken;
  let adminToken;

  beforeAll(async () => {
    const donorUser = await prisma.user.findUnique({
      where: { email: "donor1@hemoconnect.co.ke" },
    });

    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@hemoconnect.co.ke" },
    });

    donorToken = jwt.sign(
      { userId: donorUser.userId, role: donorUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    adminToken = jwt.sign(
      { userId: adminUser.userId, role: adminUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  it("rejects access without a token", async () => {
    const response = await request(app).get("/api/auth/role-access");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects public registration for the removed NGO role", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        firstName: "Test",
        lastName: "Organization",
        email: `removed-role-${Date.now()}@hemoconnect.test`,
        phone: "0790000002",
        password: "Password123!",
        role: "NGO",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ msg: "Public registration is only available for donors" }),
    ]));
  });

  it("allows a donor to access a role-aware route", async () => {
    const response = await request(app)
      .get("/api/auth/role-access")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.role).toBe("DONOR");
  });

  it("allows an admin to access a role-aware route", async () => {
    const response = await request(app)
      .get("/api/auth/role-access")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.role).toBe("ADMIN");
  });

  it("returns the live dashboard summary to an admin", async () => {
    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.metrics).toEqual(
      expect.objectContaining({
        activeUsers: expect.any(Number),
        hospitals: expect.any(Number),
        inventoryAlerts: expect.any(Number),
        openIssues: expect.any(Number),
      })
    );
    expect(Array.isArray(response.body.data.overview)).toBe(true);
    expect(Array.isArray(response.body.data.alerts)).toBe(true);
  });

  it("rejects non-admins from the admin dashboard summary", async () => {
    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("lists user accounts for admins without exposing credentials", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.users)).toBe(true);
    expect(response.body.data.users[0]).not.toHaveProperty("password");
    expect(response.body.data.pagination).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        page: 1,
        pageSize: expect.any(Number),
      })
    );
  });

  it("rejects non-admins from the user directory", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("lists hospitals for admins without exposing unrelated fields", async () => {
    const response = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.hospitals)).toBe(true);
    expect(response.body.data.pagination).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        page: 1,
        pageSize: expect.any(Number),
      })
    );
  });

  it("rejects non-admins from the hospital directory", async () => {
    const response = await request(app)
      .get("/api/admin/hospitals")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("allows an admin to change a hospital's status", async () => {
    const hospital = await prisma.hospital.findFirst({
      where: { institutionType: "HOSPITAL" },
      select: { hospitalId: true, isActive: true },
    });

    if (!hospital) return;

    const nextStatus = hospital.isActive ? "INACTIVE" : "ACTIVE";

    try {
      const response = await request(app)
        .patch(`/api/admin/hospitals/${hospital.hospitalId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: nextStatus });

      expect(response.status).toBe(200);
      expect(response.body.data.hospital.isActive).toBe(nextStatus === "ACTIVE");
    } finally {
      await prisma.hospital.update({
        where: { hospitalId: hospital.hospitalId },
        data: { isActive: hospital.isActive },
      });
    }
  });

  it("lists blood inventory for admins", async () => {
    const response = await request(app)
      .get("/api/admin/inventory")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.inventory)).toBe(true);
    expect(response.body.data.inventory.length).toBeGreaterThan(0);
    expect(response.body.data.pagination).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        page: 1,
        pageSize: expect.any(Number),
      })
    );

    const filteredResponse = await request(app)
      .get("/api/admin/inventory?search=hospital&bloodType=O%2B")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(filteredResponse.status).toBe(200);
    expect(Array.isArray(filteredResponse.body.data.inventory)).toBe(true);
  });

  it("rejects non-admins from the inventory directory", async () => {
    const response = await request(app)
      .get("/api/admin/inventory")
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("allows an admin to change a user's status", async () => {
    const donorUser = await prisma.user.findUnique({
      where: { email: "donor1@hemoconnect.co.ke" },
      select: { userId: true, status: true },
    });
    const nextStatus = donorUser.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      const response = await request(app)
        .patch(`/api/admin/users/${donorUser.userId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: nextStatus });

      expect(response.status).toBe(200);
      expect(response.body.data.user.status).toBe(nextStatus);
      expect(response.body.data.user).not.toHaveProperty("password");
    } finally {
      await prisma.user.update({
        where: { userId: donorUser.userId },
        data: { status: donorUser.status },
      });
    }
  });

  it("prevents an administrator from deactivating their own account", async () => {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@hemoconnect.co.ke" },
      select: { userId: true },
    });

    const response = await request(app)
      .patch(`/api/admin/users/${adminUser.userId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects non-admins from changing user status", async () => {
    const donorUser = await prisma.user.findUnique({
      where: { email: "donor1@hemoconnect.co.ke" },
      select: { userId: true },
    });

    const response = await request(app)
      .patch(`/api/admin/users/${donorUser.userId}/status`)
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("validates IDs and status values on administrator status-change routes", async () => {
    const responses = await Promise.all([
      request(app)
        .patch("/api/admin/users/invalid/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "ACTIVE" }),
      request(app)
        .patch("/api/admin/users/1/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SUSPENDED" }),
      request(app)
        .patch("/api/admin/hospitals/invalid/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "ACTIVE" }),
      request(app)
        .patch("/api/admin/hospitals/1/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SUSPENDED" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
  });
});
