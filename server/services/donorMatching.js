const prisma = require("./prisma");
const env = require("../config/env");

const OPEN_REQUEST_STATUSES = ["OPEN", "PENDING", "URGENT"];
const EARTH_RADIUS_KM = 6371;
const WORKER_INTERVAL_MS = 60 * 1000;

const calculateDistanceKm = (from, to) => {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const sendDonorAlert = async (request, donor, wave, distanceKm) =>
  prisma.$transaction(async (tx) => {
    const match = await tx.requestMatch.create({
      data: {
        requestId: request.requestId,
        donorId: donor.donorId,
        wave,
        distanceKm,
        status: "NOTIFIED",
        notifiedAt: new Date(),
      },
    });

    await tx.notification.create({
      data: {
        type: "EMERGENCY_BLOOD_REQUEST",
        channel: "IN_APP",
        title: "Nearby blood request",
        message: `${request.bloodType} blood is needed nearby (${distanceKm.toFixed(1)} km). Please respond to this ${request.urgencyLevel.toLowerCase()} request.`,
        status: "SENT",
        sentAt: new Date(),
        userId: donor.userId,
        requestId: request.requestId,
      },
    });

    return match;
  });

const dispatchWave = async (request, wave) => {
  const radiusKm = env.ALERT_WAVE_RADII_KM[wave - 1];
  const previousRadiusKm = wave > 1 ? env.ALERT_WAVE_RADII_KM[wave - 2] : 0;
  const donors = await prisma.donor.findMany({
        where: {
          bloodType: request.bloodType,
          isEligible: true,
          latitude: { not: null },
          longitude: { not: null },
          user: { status: "ACTIVE" },
          requestMatches: { none: { requestId: request.requestId } },
        },
        select: {
          donorId: true,
          userId: true,
          latitude: true,
          longitude: true,
          points: true,
          _count: { select: { donationRecords: true } },
        },
      });

  const rankedDonors = donors
    .map((donor) => ({
      ...donor,
      distanceKm: calculateDistanceKm(
        { latitude: request.latitude, longitude: request.longitude },
        { latitude: donor.latitude, longitude: donor.longitude }
      ),
    }))
    .filter(({ distanceKm }) =>
      (wave === 1 ? distanceKm >= previousRadiusKm : distanceKm > previousRadiusKm) &&
      distanceKm <= radiusKm
    )
    .sort((left, right) =>
      right._count.donationRecords - left._count.donationRecords ||
      right.points - left.points ||
      left.distanceKm - right.distanceKm ||
      left.donorId - right.donorId
    );

  for (const donor of rankedDonors) {
    try {
      await sendDonorAlert(request, donor, wave, donor.distanceKm);
    } catch (error) {
      if (error.code !== "P2002") throw error;
    }
  }

  await prisma.emergencyRequest.update({
    where: { requestId: request.requestId },
    data: { currentWave: wave, lastAlertAt: new Date() },
  });

  return rankedDonors.length;
};

const processEmergencyRequest = async (requestId, now = new Date()) => {
  const request = await prisma.emergencyRequest.findUnique({
    where: { requestId },
    select: {
      requestId: true,
      bloodType: true,
      urgencyLevel: true,
      status: true,
      neededBy: true,
      latitude: true,
      longitude: true,
      currentWave: true,
      lastAlertAt: true,
      matches: { where: { status: "ACCEPTED" }, select: { matchId: true }, take: 1 },
    },
  });

  const requestDay = request?.neededBy ? new Date(request.neededBy) : null;
  const currentDay = new Date(now);
  requestDay?.setUTCHours(0, 0, 0, 0);
  currentDay.setUTCHours(0, 0, 0, 0);

  if (
    !request ||
    !OPEN_REQUEST_STATUSES.includes(request.status) ||
    request.latitude === null ||
    request.longitude === null ||
    requestDay < currentDay ||
    request.matches.length > 0
  ) {
    return 0;
  }

  if (request.currentWave === 0) {
    return dispatchWave(request, 1);
  }

  const intervalMs = env.ALERT_WAVE_INTERVAL_MINUTES * 60 * 1000;
  if (!request.lastAlertAt || now.getTime() - request.lastAlertAt.getTime() < intervalMs) {
    return 0;
  }

  const nextWave = request.currentWave + 1;
  if (nextWave > env.ALERT_WAVE_RADII_KM.length) return 0;
  return dispatchWave(request, nextWave);
};

let workerTimer;

const processOpenRequests = async () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const requests = await prisma.emergencyRequest.findMany({
    where: {
      status: { in: OPEN_REQUEST_STATUSES },
      neededBy: { gte: today },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: { requestId: true },
  });

  for (const request of requests) {
    await processEmergencyRequest(request.requestId);
  }
};

const startDonorMatchingWorker = () => {
  if (workerTimer) return workerTimer;

  const run = () => {
    processOpenRequests().catch((error) => {
      console.error("Donor matching worker failed:", error);
    });
  };
  run();
  workerTimer = setInterval(run, WORKER_INTERVAL_MS);
  workerTimer.unref();
  return workerTimer;
};

module.exports = {
  calculateDistanceKm,
  processEmergencyRequest,
  startDonorMatchingWorker,
};
