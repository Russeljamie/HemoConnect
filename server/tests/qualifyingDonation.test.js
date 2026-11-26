const { getLatestQualifyingDonation } = require("../services/qualifyingDonation");

describe("qualifying donation record lookup", () => {
  it("returns the latest valid AVAILABLE record linked to a matching completed blood donation", async () => {
    const prismaClient = {
      donationRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            donationId: 9,
            donationDate: new Date("2026-11-10T10:00:00.000Z"),
            appointment: { donorId: 12, status: "COMPLETED", purpose: "Blood Donation" },
          },
          {
            donationId: 8,
            donationDate: new Date("2026-11-01T10:00:00.000Z"),
            appointment: { donorId: 12, status: "COMPLETED", purpose: "Blood Donation" },
          },
        ]),
      },
    };

    const result = await getLatestQualifyingDonation(prismaClient, 12);

    expect(result.donationId).toBe(9);
  });

  it("excludes orphan, mismatched, cancelled, confirmed, scheduled, and blood-test records", async () => {
    const prismaClient = {
      donationRecord: {
        findMany: jest.fn().mockResolvedValue([
          { donationId: 1, donationDate: new Date(), appointment: null },
          { donationId: 2, donationDate: new Date(), appointment: { donorId: 99, status: "COMPLETED", purpose: "Blood Donation" } },
          { donationId: 3, donationDate: new Date(), appointment: { donorId: 12, status: "CANCELLED", purpose: "Blood Donation" } },
          { donationId: 4, donationDate: new Date(), appointment: { donorId: 12, status: "CONFIRMED", purpose: "Blood Donation" } },
          { donationId: 5, donationDate: new Date(), appointment: { donorId: 12, status: "SCHEDULED", purpose: "Blood Donation" } },
          { donationId: 6, donationDate: new Date(), appointment: { donorId: 12, status: "COMPLETED", purpose: "Blood Test" } },
        ]),
      },
    };

    expect(await getLatestQualifyingDonation(prismaClient, 12)).toBeNull();
  });

  it("excludes RECORDED records linked to completed blood donation appointments", async () => {
    const prismaClient = {
      donationRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    expect(await getLatestQualifyingDonation(prismaClient, 12)).toBeNull();
    expect(prismaClient.donationRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "AVAILABLE" }),
    }));
  });

  it("returns only the latest qualifying record, including when a newer record is non-qualifying", async () => {
    const prismaClient = {
      donationRecord: {
        findMany: jest.fn().mockResolvedValue([
          { donationId: 20, donationDate: new Date("2026-11-20T10:00:00.000Z"), appointment: { donorId: 12, status: "CONFIRMED", purpose: "Blood Donation" } },
          { donationId: 19, donationDate: new Date("2026-11-10T10:00:00.000Z"), appointment: { donorId: 12, status: "COMPLETED", purpose: "Blood Donation" } },
          { donationId: 18, donationDate: new Date("2026-11-01T10:00:00.000Z"), appointment: { donorId: 12, status: "COMPLETED", purpose: "Blood Donation" } },
        ]),
      },
    };

    const result = await getLatestQualifyingDonation(prismaClient, 12);
    expect(result.donationId).toBe(19);
  });
});
