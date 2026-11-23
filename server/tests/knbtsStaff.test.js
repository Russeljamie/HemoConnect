const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");
const {
  KNBTS_CENTRE,
  ensureKnbtsDemoAccounts,
  getDemoPassword,
  hashDemoPassword,
} = require("../../prisma/knbtsDemoAccounts");

function tokenFor(user) {
  return jwt.sign(
    { userId: user.userId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

describe("KNBTS staff access and centre profile", () => {
  let adminToken;
  let hospitalStaffToken;
  let donorToken;
  let knbtsToken;
  let knbtsUser;
  let centre;

  beforeAll(async () => {
    const [admin, hospitalStaff, donor] = await Promise.all([
      prisma.user.findUnique({ where: { email: "admin@hemoconnect.co.ke" } }),
      prisma.user.findUnique({ where: { email: "staff1@hemoconnect.co.ke" } }),
      prisma.user.findUnique({ where: { email: "donor1@hemoconnect.co.ke" } }),
    ]);

    adminToken = tokenFor(admin);
    hospitalStaffToken = tokenFor(hospitalStaff);
    donorToken = tokenFor(donor);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "knbts1@hemoconnect.co.ke", password: getDemoPassword() });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("KNBTS_STAFF");
    knbtsToken = login.body.data.token;

    knbtsUser = await prisma.user.findUnique({
      where: { email: "knbts1@hemoconnect.co.ke" },
      include: { knbtsStaff: { include: { centre: true } } },
    });
    centre = knbtsUser.knbtsStaff.centre;
  });

  it("allows KNBTS staff to log in and retrieve their centre profile", async () => {
    const response = await request(app)
      .get("/api/knbts/profile")
      .set("Authorization", `Bearer ${knbtsToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.staff).toEqual(expect.objectContaining({
      designation: "Blood Bank Technician",
      centre: expect.objectContaining({
        name: KNBTS_CENTRE.name,
        location: KNBTS_CENTRE.location,
        latitude: KNBTS_CENTRE.latitude,
        longitude: KNBTS_CENTRE.longitude,
        institutionType: "KNBTS_CENTRE",
      }),
    }));
  });

  it.each([
    ["hospital staff", () => hospitalStaffToken],
    ["donor", () => donorToken],
    ["admin", () => adminToken],
  ])("rejects %s access to the KNBTS profile", async (_role, getToken) => {
    const response = await request(app)
      .get("/api/knbts/profile")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(response.status).toBe(403);
  });

  it("rejects KNBTS staff from hospital and donor endpoints", async () => {
    const [hospitalResponse, donorResponse] = await Promise.all([
      request(app)
        .get("/api/hospital/profile")
        .set("Authorization", `Bearer ${knbtsToken}`),
      request(app)
        .get("/api/donor/profile")
        .set("Authorization", `Bearer ${knbtsToken}`),
    ]);

    expect(hospitalResponse.status).toBe(403);
    expect(donorResponse.status).toBe(403);
  });

  it("rejects public registration as KNBTS staff", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        firstName: "KNBTS",
        lastName: "Applicant",
        email: `knbts-registration-${Date.now()}@hemoconnect.test`,
        phone: "0790000001",
        password: "RegistrationPassword123!",
        role: "KNBTS_STAFF",
      });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ msg: "Public registration is only available for donors" }),
    ]));
  });

  it("rejects hospital staff creation for a KNBTS centre", async () => {
    const response = await request(app)
      .post("/api/admin/hospital-staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        firstName: "Centre",
        lastName: "Account",
        email: `centre-staff-${Date.now()}@hemoconnect.test`,
        phone: "07123456789",
        designation: "Technician",
        hospitalId: centre.hospitalId,
        temporaryPassword: "TemporaryPassword-2026!",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/HOSPITAL institution/);
  });

  it("keeps all existing hospitals typed as HOSPITAL", async () => {
    const institutions = await prisma.hospital.findMany({
      select: { name: true, institutionType: true },
    });

    expect(institutions.length).toBeGreaterThan(1);
    expect(institutions.filter(({ institutionType }) => institutionType === "HOSPITAL").length)
      .toBeGreaterThan(0);
    expect(institutions.find(({ name }) => name === KNBTS_CENTRE.name).institutionType)
      .toBe("KNBTS_CENTRE");
    expect(institutions.filter(({ name }) => name !== KNBTS_CENTRE.name)
      .every(({ institutionType }) => institutionType === "HOSPITAL")).toBe(true);
  });

  it("lists KNBTS staff with their centre in the admin user directory", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .query({ role: "KNBTS_STAFF" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.users).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "KNBTS_STAFF",
        knbtsStaff: expect.objectContaining({
          designation: "Blood Bank Technician",
          centre: expect.objectContaining({
            name: KNBTS_CENTRE.name,
            institutionType: "KNBTS_CENTRE",
          }),
        }),
      }),
    ]));
  });

  it("filters the admin institution directory by institution type", async () => {
    const [hospitalResponse, centreResponse] = await Promise.all([
      request(app)
        .get("/api/admin/hospitals")
        .query({ institutionType: "HOSPITAL" })
        .set("Authorization", `Bearer ${adminToken}`),
      request(app)
        .get("/api/admin/hospitals")
        .query({ institutionType: "KNBTS_CENTRE" })
        .set("Authorization", `Bearer ${adminToken}`),
    ]);

    expect(hospitalResponse.status).toBe(200);
    expect(hospitalResponse.body.data.hospitals.length).toBeGreaterThan(0);
    expect(hospitalResponse.body.data.hospitals.every(
      ({ institutionType }) => institutionType === "HOSPITAL"
    )).toBe(true);
    expect(centreResponse.status).toBe(200);
    expect(centreResponse.body.data.hospitals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: KNBTS_CENTRE.name,
        institutionType: "KNBTS_CENTRE",
      }),
    ]));
  });

  it("does not include the KNBTS centre in nearby donor hospitals", async () => {
    const response = await request(app)
      .get("/api/donor/appointments/nearby")
      .query({ latitude: centre.latitude, longitude: centre.longitude })
      .set("Authorization", `Bearer ${donorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.hospitals).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ hospitalId: centre.hospitalId }),
    ]));
  });

  it("does not increase KNBTS centre, user, or staff-profile counts when ensured twice", async () => {
    const passwordHash = await hashDemoPassword();
    const countKnbtsRecords = async () => {
      const [centres, users, profiles] = await Promise.all([
        prisma.hospital.count({
          where: {
            name: KNBTS_CENTRE.name,
            institutionType: "KNBTS_CENTRE",
          },
        }),
        prisma.user.count({ where: { role: "KNBTS_STAFF" } }),
        prisma.knbtsStaff.count(),
      ]);

      return { centres, users, profiles };
    };

    await ensureKnbtsDemoAccounts(prisma, passwordHash);
    const afterFirstEnsure = await countKnbtsRecords();

    await ensureKnbtsDemoAccounts(prisma, passwordHash);
    const afterSecondEnsure = await countKnbtsRecords();

    expect(afterSecondEnsure).toEqual(afterFirstEnsure);
    expect(afterFirstEnsure).toEqual({ centres: 1, users: 2, profiles: 2 });
  });
});
