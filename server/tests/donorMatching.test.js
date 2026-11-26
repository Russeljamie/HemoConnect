const prisma = require("../services/prisma");
const env = require("../config/env");
const { calculateDistanceKm, processEmergencyRequest } = require("../services/donorMatching");
const { createTestArtifactTracker } = require("./helpers/testArtifactTracker");
const { createEmergencyDonorFixtures } = require("./helpers/emergencyDonorFixtures");

describe("GPS donor matching and alert dispatch", () => {
  let staffUser;
  const artifactTracker = createTestArtifactTracker(prisma);
  const donorFixtures = createEmergencyDonorFixtures(prisma);

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

  const createRequest = (bloodType, latitude, longitude) =>
    prisma.emergencyRequest.create({
      data: {
        bloodType,
        quantityRequired: 1,
        urgencyLevel: "MEDIUM",
        neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        latitude,
        longitude,
        status: "OPEN",
        hospitalId: staffUser.hospitalStaff.hospitalId,
        requestedByUserId: staffUser.userId,
        createdByStaffId: staffUser.hospitalStaff.staffId,
      },
    });

  beforeAll(async () => {
    staffUser = await prisma.user.findUnique({
      where: { email: "staff1@hemoconnect.co.ke" },
      include: { hospitalStaff: true },
    });
    if (!staffUser?.hospitalStaff) throw new Error("Donor matching tests require hospital staff.");
  });

  beforeEach(async () => {
    await artifactTracker.snapshotExisting();
  });

  afterEach(async () => {
    await artifactTracker.cleanup();
    await donorFixtures.cleanup();
  });

  it("ranks compatible eligible donors by nearest distance", async () => {
    const farther = await donorFixtures.createDonor({
      label: "farther",
      bloodType: "O+",
      latitude: 0.002,
      longitude: 0,
    });
    const nearest = await donorFixtures.createDonor({
      label: "nearest",
      bloodType: "O+",
      latitude: 0.001,
      longitude: 0,
    });
    await donorFixtures.createApproval(farther.donor);
    await donorFixtures.createApproval(nearest.donor);
    const emergencyRequest = await createRequest("O+", 0, 0);

    try {
      expect(await processEmergencyRequest(emergencyRequest.requestId)).toBe(2);
      expect(await prisma.smsOutbox.count({
        where: { eventKey: { startsWith: `emergency-${emergencyRequest.requestId}-` } },
      })).toBe(0);
      const matches = await prisma.requestMatch.findMany({
        where: { requestId: emergencyRequest.requestId },
        orderBy: { matchId: "asc" },
        select: { donorId: true, distanceKm: true },
      });

      expect(matches.map(({ donorId }) => donorId)).toEqual([
        nearest.donor.donorId,
        farther.donor.donorId,
      ]);
      expect(matches[0].distanceKm).toBeLessThan(matches[1].distanceKm);
    } finally {
      await trackRequestArtifacts(emergencyRequest.requestId);
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
    }
  });

  it("matches compatible non-identical blood types and excludes incompatible donors", async () => {
    const compatible = await donorFixtures.createDonor({
      label: "compatible",
      bloodType: "O+",
      latitude: 0,
      longitude: 0,
    });
    const incompatible = await donorFixtures.createDonor({
      label: "incompatible",
      bloodType: "B+",
      latitude: 0,
      longitude: 0,
    });
    await donorFixtures.createApproval(compatible.donor);
    await donorFixtures.createApproval(incompatible.donor);
    const emergencyRequest = await createRequest("A+", 0, 0);

    try {
      expect(await processEmergencyRequest(emergencyRequest.requestId)).toBe(1);
      const matches = await prisma.requestMatch.findMany({
        where: { requestId: emergencyRequest.requestId },
        select: { donorId: true },
      });
      expect(matches).toEqual([{ donorId: compatible.donor.donorId }]);
    } finally {
      await trackRequestArtifacts(emergencyRequest.requestId);
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
    }
  });

  it("excludes donors without active questionnaire approval", async () => {
    const unapproved = await donorFixtures.createDonor({
      label: "unapproved",
      latitude: 0,
      longitude: 0,
    });
    const emergencyRequest = await createRequest("O+", 0, 0);

    try {
      expect(await processEmergencyRequest(emergencyRequest.requestId)).toBe(0);
      expect(await prisma.requestMatch.count({
        where: { requestId: emergencyRequest.requestId },
      })).toBe(0);
    } finally {
      await trackRequestArtifacts(emergencyRequest.requestId);
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
    }
  });

  it("excludes recently donated and expired-approval donors", async () => {
    const recentDonor = await donorFixtures.createDonor({
      label: "recent-donation",
      latitude: 0,
      longitude: 0,
    });
    const expiredApprovalDonor = await donorFixtures.createDonor({
      label: "expired-approval",
      latitude: 0,
      longitude: 0,
    });
    const knbtsStaff = await prisma.knbtsStaff.findFirst();
    await donorFixtures.createApproval(recentDonor.donor);
    await donorFixtures.createApproval(expiredApprovalDonor.donor, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const donationDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const appointment = await prisma.appointment.create({
      data: {
        date: donationDate,
        time: "09:00",
        purpose: "Blood Donation",
        status: "COMPLETED",
        donorId: recentDonor.donor.donorId,
      },
    });
    const donation = await prisma.donationRecord.create({
      data: {
        donationDate,
        bloodType: "O+",
        quantity: 450,
        status: "AVAILABLE",
        donorId: recentDonor.donor.donorId,
        appointmentId: appointment.appointmentId,
        recordedByKnbtsStaffId: knbtsStaff.knbtsStaffId,
      },
    });
    const emergencyRequest = await createRequest("O+", 0, 0);

    try {
      expect(await processEmergencyRequest(emergencyRequest.requestId)).toBe(0);
      expect(await prisma.requestMatch.count({
        where: { requestId: emergencyRequest.requestId },
      })).toBe(0);
    } finally {
      await trackRequestArtifacts(emergencyRequest.requestId);
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
      await prisma.donationRecord.delete({ where: { donationId: donation.donationId } });
      await prisma.appointment.delete({ where: { appointmentId: appointment.appointmentId } });
    }
  });

  it("expands to the next distance tier after the configured response window", async () => {
    if (env.ALERT_WAVE_RADII_KM.length < 2) {
      throw new Error("Distance tier test requires at least two configured alert waves.");
    }
    const donor = await donorFixtures.createDonor({
      label: "next-wave",
      bloodType: "O+",
      latitude: (env.ALERT_WAVE_RADII_KM[0] + env.ALERT_WAVE_RADII_KM[1]) / 2 / 111.2,
      longitude: 0,
    });
    await donorFixtures.createApproval(donor.donor);
    const emergencyRequest = await createRequest("O+", 0, 0);

    try {
      expect(await processEmergencyRequest(emergencyRequest.requestId)).toBe(0);
      expect(await prisma.smsOutbox.count({
        where: { eventKey: { startsWith: `emergency-${emergencyRequest.requestId}-` } },
      })).toBe(0);
      const firstWave = await prisma.emergencyRequest.findUnique({
        where: { requestId: emergencyRequest.requestId },
        select: { currentWave: true, lastAlertAt: true },
      });
      expect(firstWave.currentWave).toBe(1);

      const nextWindow = new Date(
        firstWave.lastAlertAt.getTime() + env.ALERT_WAVE_INTERVAL_MINUTES * 60 * 1000 + 1
      );
      await processEmergencyRequest(emergencyRequest.requestId, nextWindow);
      const match = await prisma.requestMatch.findUnique({
        where: {
          requestId_donorId: {
            requestId: emergencyRequest.requestId,
            donorId: donor.donor.donorId,
          },
        },
      });
      expect(match).toEqual(expect.objectContaining({ wave: 2, status: "NOTIFIED" }));
    } finally {
      await trackRequestArtifacts(emergencyRequest.requestId);
      await prisma.emergencyRequest.delete({ where: { requestId: emergencyRequest.requestId } });
    }
  });

  it("calculates proximity in kilometres", () => {
    expect(calculateDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 }
    )).toBeCloseTo(111.2, 0);
  });
});
