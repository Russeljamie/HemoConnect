const {
  addCalendarDays,
  getDonationEligibility,
  isEligibleForDonationOn,
} = require("../utils/donationEligibility");

describe("donation eligibility date calculations", () => {
  it("adds 90 Nairobi calendar days to a January 1 donation", () => {
    const eligibility = getDonationEligibility({
      lastSuccessfulDonationDate: new Date("2026-01-01T00:00:00.000Z"),
      today: new Date("2026-03-31T22:00:00.000Z"),
    });

    expect(eligibility.nextEligibleDonationDate.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("blocks 89 days before the eligible date", () => {
    expect(isEligibleForDonationOn(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-03-31T00:00:00.000Z")
    )).toBe(false);
  });

  it("allows scheduling on the 90th calendar day", () => {
    expect(isEligibleForDonationOn(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-04-01T00:00:00.000Z")
    )).toBe(true);
  });

  it("supports a configured positive interval", () => {
    expect(addCalendarDays(new Date("2026-10-31T00:00:00.000Z"), 90).toISOString().slice(0, 10))
      .toBe("2027-01-29");
    expect(getDonationEligibility({
      lastSuccessfulDonationDate: new Date("2026-01-01T00:00:00.000Z"),
      today: new Date("2026-02-14T00:00:00.000Z"),
      waitingPeriodDays: 45,
    }).nextEligibleDonationDate.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("allows donation scheduling when there is no qualifying successful date", () => {
    expect(getDonationEligibility({ lastSuccessfulDonationDate: null }).nextEligibleDonationDate).toBeNull();
    expect(isEligibleForDonationOn(null, new Date("2026-11-08T00:00:00.000Z"))).toBe(true);
  });
});
