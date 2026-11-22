const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");
const { calculateDistanceKm, processEmergencyRequest } = require("../services/donorMatching");

describe("GPS donor matching and alert dispatch", () => {
  let donorUser;
  let staffUser;
  let staffToken;
  let donorToken;

  beforeAll(async () => {
    [donorUser, staffUser] = await Promise.all([
      prisma.user.findUnique({
        where: { email: "donor1@hemoconnect.co.ke" },
        include: { donor: true },
      }),
      prisma.user.findUnique({
        where: { email: "staff1@hemoconnect.co.ke" },
        include: { hospitalStaff: true },
      }),
    ]);

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

  it("ranks the nearest eligible donor first, regardless of donor ID", async () => {
    const originalDonors = await prisma.donor.findMany({
      select: {
        donorId: true,
        bloodType: true,
        latitude: true,
        longitude: true,
        isEligible: true,
        user: { select: { status: true } },
      },
      orderBy: { donorId: "asc" },
    });
    const activeDonors = originalDonors.filter(({ user }) => user.status === "ACTIVE");
    expect(activeDonors.length).toBeGreaterThanOrEqual(2);

    const fartherDonor = activeDonors[0];
    const nearestDonor = activeDonors[activeDonors.length - 1];
    let requestId;

    try {
      await Promise.all(originalDonors.map((donor) =>
        prisma.donor.update({
          where: { donorId: donor.donorId },
          data: {
            bloodType: donor.donorId === fartherDonor.donorId || donor.donorId === nearestDonor.donorId
              ? "O+"
              : "A+",
            latitude: donor.donorId === nearestDonor.donorId
              ? 0.001
              : donor.donorId === fartherDonor.donorId
                ? 0.002
                : 1,
            longitude: 0,
            isEligible: true,
          },
        })
      ));

      const emergencyRequest = await prisma.emergencyRequest.create({
        data: {
          bloodType: "O+",
          quantityRequired: 1,
          urgencyLevel: "MEDIUM",
          neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          latitude: 0,
          longitude: 0,
          status: "OPEN",
          hospitalId: staffUser.hospitalStaff.hospitalId,
          requestedByUserId: staffUser.userId,
          createdByStaffId: staffUser.hospitalStaff.staffId,
          patientReference: "MATCH-RANK",
        },
      });
      requestId = emergencyRequest.requestId;

      expect(await processEmergencyRequest(requestId)).toBe(2);
      const matches = await prisma.requestMatch.findMany({
        where: { requestId },
        orderBy: { matchId: "asc" },
        select: { donorId: true, distanceKm: true },
      });

      expect(matches.map(({ donorId }) => donorId)).toEqual([
        nearestDonor.donorId,
        fartherDonor.donorId,
      ]);
      expect(matches[0].distanceKm).toBeLessThan(matches[1].distanceKm);
    } finally {
      if (requestId) {
        await prisma.notification.deleteMany({ where: { requestId } });
        await prisma.requestMatch.deleteMany({ where: { requestId } });
        await prisma.emergencyRequest.delete({ where: { requestId } });
      }
      await Promise.all(originalDonors.map((donor) =>
        prisma.donor.update({
          where: { donorId: donor.donorId },
          data: {
            bloodType: donor.bloodType,
            latitude: donor.latitude,
            longitude: donor.longitude,
            isEligible: donor.isEligible,
          },
        })
      ));
    }
  });

  it("calculates proximity in kilometres", () => {
    expect(calculateDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 }
    )).toBeCloseTo(111.2, 0);
  });

  it("only alerts donors with the exact requested blood type", async () => {
    const otherDonorUser = await prisma.user.findUnique({
      where: { email: "donor2@hemoconnect.co.ke" },
      include: { donor: true },
    });
    const originalDonor = await prisma.donor.findUnique({
      where: { donorId: otherDonorUser.donor.donorId },
    });
    const mismatchedType = originalDonor.bloodType === "O+" ? "A+" : "O+";
    await prisma.donor.update({
      where: { donorId: originalDonor.donorId },
      data: { bloodType: mismatchedType, latitude: 0, longitude: 0, isEligible: true },
    });

    let requestId;
    try {
      const emergencyRequest = await prisma.emergencyRequest.create({
        data: {
          bloodType: originalDonor.bloodType,
          quantityRequired: 1,
          urgencyLevel: "MEDIUM",
          neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          latitude: 0,
          longitude: 0,
          status: "OPEN",
          hospitalId: staffUser.hospitalStaff.hospitalId,
          requestedByUserId: staffUser.userId,
          createdByStaffId: staffUser.hospitalStaff.staffId,
        },
      });
      requestId = emergencyRequest.requestId;
      await processEmergencyRequest(requestId);

      expect(await prisma.requestMatch.findUnique({
        where: {
          requestId_donorId: {
            requestId,
            donorId: originalDonor.donorId,
          },
        },
      })).toBeNull();
    } finally {
      if (requestId) {
        await prisma.notification.deleteMany({ where: { requestId } });
        await prisma.requestMatch.deleteMany({ where: { requestId } });
        await prisma.emergencyRequest.delete({ where: { requestId } });
      }
      await prisma.donor.update({
        where: { donorId: originalDonor.donorId },
        data: {
          bloodType: originalDonor.bloodType,
          latitude: originalDonor.latitude,
          longitude: originalDonor.longitude,
          isEligible: originalDonor.isEligible,
        },
      });
    }
  });

  it("expands to the next distance tier after the configured response window", async () => {
    const secondDonorUser = await prisma.user.findUnique({
      where: { email: "donor2@hemoconnect.co.ke" },
      include: { donor: true },
    });
    const originalDonor = await prisma.donor.findUnique({
      where: { donorId: secondDonorUser.donor.donorId },
    });

    await prisma.donor.update({
      where: { donorId: secondDonorUser.donor.donorId },
      data: { latitude: 70.1, longitude: -100, isEligible: true },
    });

    let requestId;
    try {
      const emergencyRequest = await prisma.emergencyRequest.create({
        data: {
          bloodType: secondDonorUser.donor.bloodType,
          quantityRequired: 1,
          urgencyLevel: "MEDIUM",
          neededBy: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          latitude: 70,
          longitude: -100,
          status: "OPEN",
          hospitalId: staffUser.hospitalStaff.hospitalId,
          requestedByUserId: staffUser.userId,
          createdByStaffId: staffUser.hospitalStaff.staffId,
        },
      });
      requestId = emergencyRequest.requestId;

      expect(await processEmergencyRequest(requestId)).toBe(0);
      const firstWave = await prisma.emergencyRequest.findUnique({
        where: { requestId },
        select: { currentWave: true, lastAlertAt: true },
      });
      expect(firstWave.currentWave).toBe(1);

      const nextWindow = new Date(
        firstWave.lastAlertAt.getTime() + env.ALERT_WAVE_INTERVAL_MINUTES * 60 * 1000 + 1
      );
      await processEmergencyRequest(requestId, nextWindow);

      const match = await prisma.requestMatch.findUnique({
        where: {
          requestId_donorId: {
            requestId,
            donorId: secondDonorUser.donor.donorId,
          },
        },
      });
      expect(match).toEqual(expect.objectContaining({ wave: 2, status: "NOTIFIED" }));
    } finally {
      if (requestId) {
        await prisma.notification.deleteMany({ where: { requestId } });
        await prisma.requestMatch.deleteMany({ where: { requestId } });
        await prisma.emergencyRequest.delete({ where: { requestId } });
      }
      await prisma.donor.update({
        where: { donorId: originalDonor.donorId },
        data: {
          latitude: originalDonor.latitude,
          longitude: originalDonor.longitude,
          isEligible: originalDonor.isEligible,
        },
      });
    }
  });
});
