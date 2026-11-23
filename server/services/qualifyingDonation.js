const getLatestQualifyingDonation = async (prismaClient, donorId) => {
  if (!Number.isSafeInteger(donorId) || donorId < 1) return null;

  const records = await prismaClient.donationRecord.findMany({
    where: {
      donorId,
      status: "AVAILABLE",
      appointmentId: { not: null },
    },
    orderBy: [{ donationDate: "desc" }, { donationId: "desc" }],
    select: {
      donationId: true,
      donationDate: true,
      appointment: {
        select: {
          donorId: true,
          status: true,
          purpose: true,
        },
      },
    },
  });

  return records.find((record) =>
    record.appointment?.donorId === donorId &&
    record.appointment.status === "COMPLETED" &&
    typeof record.appointment.purpose === "string" &&
    record.appointment.purpose.trim().toLowerCase() === "blood donation"
  ) || null;
};

module.exports = { getLatestQualifyingDonation };
