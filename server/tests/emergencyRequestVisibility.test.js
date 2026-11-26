const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");
const { createTestArtifactTracker } = require("./helpers/testArtifactTracker");
const { createEmergencyDonorFixtures } = require("./helpers/emergencyDonorFixtures");

describe("Emergency request donor visibility and authorization", () => {
  let staffUser;
  let staffToken;
  const artifactTracker = createTestArtifactTracker(prisma);
  const donorFixtures = createEmergencyDonorFixtures(prisma);
  const requestIds = new Set();

  const createRequest = async (overrides = {}) => {
    const emergencyRequest = await prisma.emergencyRequest.create({
      data: {
        bloodType: "O+",
        quantityRequired: 2,
        urgencyLevel: "HIGH",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        latitude: -1.286389,
        longitude: 36.817223,
        notes: "Urgent requirement for the hospital blood bank.",
        patientReference: "PRIVATE-CASE-123",
        status: "OPEN",
        hospitalId: staffUser.hospitalStaff.hospitalId,
        requestedByUserId: staffUser.userId,
        createdByStaffId: staffUser.hospitalStaff.staffId,
        ...overrides,
      },
    });
    requestIds.add(emergencyRequest.requestId);
    return emergencyRequest;
  };

  const createNotifiedMatch = (requestId, donorId) =>
    prisma.requestMatch.create({
      data: {
        requestId,
        donorId,
        status: "NOTIFIED",
        wave: 1,
        distanceKm: 1.2,
        notifiedAt: new Date(),
      },
    });

  const trackRequestArtifacts = async (requestId) => {
    const matches = await prisma.requestMatch.findMany({
      where: { requestId },
      include: { donor: { select: { user: { select: { email: true } } } } },
    });
    artifactTracker.trackNotification({ requestId });
    artifactTracker.trackSms({ eventKey: { startsWith: `emergency-${requestId}-` } });
    artifactTracker.trackEmail({
      recipientEmail: { in: matches.map(({ donor }) => donor.user.email) },
      template: "DONOR_EMERGENCY_ALERT",
    });
    artifactTracker.trackAudit({
      entityType: "EmergencyRequest",
      entityId: String(requestId),
    });
    await artifactTracker.capture();
  };

  beforeAll(async () => {
    staffUser = await prisma.user.findUnique({
      where: { email: "staff1@hemoconnect.co.ke" },
      include: { hospitalStaff: true },
    });
    if (!staffUser?.hospitalStaff) {
      throw new Error("Emergency visibility tests require hospital staff.");
    }
    staffToken = jwt.sign(
      { userId: staffUser.userId, role: staffUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  });

  beforeEach(async () => {
    await artifactTracker.snapshotExisting();
  });

  afterEach(async () => {
    for (const requestId of requestIds) {
      await trackRequestArtifacts(requestId);
      await prisma.emergencyRequest.deleteMany({ where: { requestId } });
    }
    requestIds.clear();
    await artifactTracker.cleanup();
    await donorFixtures.cleanup();
  });

  it("shows only addressed requests and rejects responses from other donors", async () => {
    const addressedDonor = await donorFixtures.createDonor({ label: "addressed" });
    const otherDonor = await donorFixtures.createDonor({ label: "not-addressed" });
    await donorFixtures.createApproval(addressedDonor.donor);
    await donorFixtures.createApproval(otherDonor.donor);
    const emergencyRequest = await createRequest();
    await createNotifiedMatch(emergencyRequest.requestId, addressedDonor.donor.donorId);

    const addressedToken = jwt.sign(
      { userId: addressedDonor.user.userId, role: addressedDonor.user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    const otherToken = jwt.sign(
      { userId: otherDonor.user.userId, role: otherDonor.user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const addressedAlerts = await request(app)
      .get("/api/donor/alerts")
      .set("Authorization", `Bearer ${addressedToken}`);
    expect(addressedAlerts.status).toBe(200);
    expect(addressedAlerts.body.data.alerts).toEqual([
      expect.objectContaining({
        requestId: emergencyRequest.requestId,
        bloodType: "O+",
        quantityRequired: 2,
        urgencyLevel: "HIGH",
        notes: emergencyRequest.notes,
        hospital: expect.objectContaining({ name: expect.any(String), location: expect.any(String) }),
      }),
    ]);
    expect(addressedAlerts.body.data.alerts[0]).not.toHaveProperty("patientReference");
    expect(addressedAlerts.body.data.alerts[0]).not.toHaveProperty("questionnaireAnswers");

    const otherAlerts = await request(app)
      .get("/api/donor/alerts")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherAlerts.status).toBe(200);
    expect(otherAlerts.body.data.alerts).toEqual([]);

    const unauthorizedResponse = await request(app)
      .post(`/api/donor/alerts/${emergencyRequest.requestId}/respond`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ response: "ACCEPT" });
    expect(unauthorizedResponse.status).toBe(404);

    const wrongRole = await request(app)
      .get("/api/donor/alerts")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(wrongRole.status).toBe(403);

    const hospitalRequests = await request(app)
      .get("/api/hospital/requests")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(hospitalRequests.status).toBe(200);
    const hospitalRequest = hospitalRequests.body.data.requests
      .find((item) => item.requestId === emergencyRequest.requestId);
    expect(hospitalRequest.matches).toEqual([{ status: "NOTIFIED" }]);
    expect(hospitalRequest.matches[0]).not.toHaveProperty("donor");
  });

  it("hides cancelled and expired alerts and rejects actions on them", async () => {
    const donor = await donorFixtures.createDonor({ label: "inactive-request" });
    await donorFixtures.createApproval(donor.donor);
    const token = jwt.sign(
      { userId: donor.user.userId, role: donor.user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
    const cancelledRequest = await createRequest({ status: "CANCELLED" });
    const expiredRequest = await createRequest({
      neededBy: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await createNotifiedMatch(cancelledRequest.requestId, donor.donor.donorId);
    await createNotifiedMatch(expiredRequest.requestId, donor.donor.donorId);

    const alerts = await request(app)
      .get("/api/donor/alerts")
      .set("Authorization", `Bearer ${token}`);
    expect(alerts.status).toBe(200);
    expect(alerts.body.data.alerts).toEqual([]);

    const cancelledResponse = await request(app)
      .post(`/api/donor/alerts/${cancelledRequest.requestId}/respond`)
      .set("Authorization", `Bearer ${token}`)
      .send({ response: "ACCEPT" });
    expect(cancelledResponse.status).toBe(409);

    const expiredResponse = await request(app)
      .post(`/api/donor/alerts/${expiredRequest.requestId}/respond`)
      .set("Authorization", `Bearer ${token}`)
      .send({ response: "DECLINE" });
    expect(expiredResponse.status).toBe(409);
  });
});
