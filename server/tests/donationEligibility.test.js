const {
  addCalendarMonths,
  getDonationEligibility,
  isEligibleForDonationOn,
} = require("../utils/donationEligibility");

describe("donation eligibility date calculations", () => {
  it("calculates a four-calendar-month date from the last successful donation", () => {
    const eligibility = getDonationEligibility({
      lastSuccessfulDonationDate: new Date("2026-07-08T00:00:00.000Z"),
      today: new Date("2026-11-07T12:00:00.000Z"),
    });

    expect(eligibility.nextEligibleDonationDate.toISOString().slice(0, 10)).toBe("2026-11-08");
    expect(eligibility.canScheduleDonation).toBe(false);
  });

  it("allows scheduling on the next eligible date", () => {
    expect(isEligibleForDonationOn(
      new Date("2026-07-08T00:00:00.000Z"),
      new Date("2026-11-08T00:00:00.000Z")
    )).toBe(true);
  });

  it("clamps dates at the end of shorter target months", () => {
    expect(addCalendarMonths(new Date("2026-10-31T00:00:00.000Z"), 4).toISOString().slice(0, 10))
      .toBe("2027-02-28");
  });

  it("allows donation scheduling when there is no prior successful date", () => {
    expect(getDonationEligibility({ lastSuccessfulDonationDate: null }).nextEligibleDonationDate).toBeNull();
    expect(isEligibleForDonationOn(null, new Date("2026-11-08T00:00:00.000Z"))).toBe(true);
  });
});
