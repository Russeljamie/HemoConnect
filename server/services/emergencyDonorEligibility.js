const {
  DONATION_INTERVAL_DAYS,
  addCalendarDays,
  isEligibleForDonationOn,
  startOfNairobiDay,
} = require("../utils/donationEligibility");

const getEligibleEmergencyDonorIds = async (prismaClient, donorIds, now = new Date()) => {
  const uniqueDonorIds = [...new Set(donorIds)].filter((donorId) =>
    Number.isSafeInteger(donorId) && donorId > 0
  );
  const today = startOfNairobiDay(now);
  if (!uniqueDonorIds.length || !today) return new Set();

  const [approvals, recentDonations] = await Promise.all([
    prismaClient.questionnaireApproval.findMany({
      where: {
        donorId: { in: uniqueDonorIds },
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      select: { donorId: true },
    }),
    prismaClient.donationRecord.findMany({
      where: {
        donorId: { in: uniqueDonorIds },
        status: "AVAILABLE",
        appointmentId: { not: null },
        donationDate: { gte: addCalendarDays(today, -DONATION_INTERVAL_DAYS) },
        appointment: {
          is: {
            donorId: { in: uniqueDonorIds },
            status: "COMPLETED",
            purpose: { equals: "Blood Donation", mode: "insensitive" },
          },
        },
      },
      orderBy: [{ donationDate: "desc" }, { donationId: "desc" }],
      select: {
        donorId: true,
        donationDate: true,
        appointment: { select: { donorId: true } },
      },
    }),
  ]);

  const approvedDonorIds = new Set(approvals.map(({ donorId }) => donorId));
  const latestDonationByDonorId = new Map();
  for (const donation of recentDonations) {
    if (
      donation.appointment?.donorId === donation.donorId &&
      !latestDonationByDonorId.has(donation.donorId)
    ) {
      latestDonationByDonorId.set(donation.donorId, donation.donationDate);
    }
  }

  return new Set(uniqueDonorIds.filter((donorId) =>
    approvedDonorIds.has(donorId) &&
    isEligibleForDonationOn(latestDonationByDonorId.get(donorId) || null, now)
  ));
};

module.exports = { getEligibleEmergencyDonorIds };
