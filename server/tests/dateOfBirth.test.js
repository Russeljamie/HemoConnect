const {
  parseDateOfBirth,
  ageFromDateOfBirth,
  isValidDonorDateOfBirth,
  getDonorEligibility,
} = require("../utils/dateOfBirth");
const {
  getNairobiDateParts,
  startOfNairobiDay,
  addCalendarDays,
  compareNairobiDateOnly,
} = require("../utils/nairobiDate");

describe("Africa/Nairobi donor age eligibility", () => {
  it("rejects exactly 18 and permits the day after the 18th birthday", () => {
    const birthDate = parseDateOfBirth("2008-11-23");

    expect(ageFromDateOfBirth(birthDate, new Date("2026-11-23T12:00:00.000Z"))).toBe(18);
    expect(isValidDonorDateOfBirth(birthDate, new Date("2026-11-23T12:00:00.000Z"))).toBe(false);
    expect(isValidDonorDateOfBirth(birthDate, new Date("2026-11-24T12:00:00.000Z"))).toBe(true);
  });

  it("uses February 28 as the anniversary for February 29 birthdays", () => {
    const birthDate = parseDateOfBirth("2008-02-29");

    expect(getDonorEligibility(birthDate, new Date("2026-02-28T12:00:00.000Z")).isValid).toBe(false);
    expect(getDonorEligibility(birthDate, new Date("2026-03-01T12:00:00.000Z")).isValid).toBe(true);
  });

  it("preserves the inclusive maximum age of 100", () => {
    expect(isValidDonorDateOfBirth(parseDateOfBirth("1926-11-23"), new Date("2026-11-23T12:00:00.000Z"))).toBe(true);
    expect(isValidDonorDateOfBirth(parseDateOfBirth("1925-11-23"), new Date("2026-11-24T12:00:00.000Z"))).toBe(false);
  });

  it("strictly rejects invalid date strings", () => {
    expect(parseDateOfBirth("2026-02-29")).toBeNull();
    expect(parseDateOfBirth("2008/02/29")).toBeNull();
  });

  it("extracts Nairobi civil dates across UTC midnight boundaries", () => {
    expect(getNairobiDateParts(new Date("2026-03-31T20:59:59.000Z"))).toEqual({ year: 2026, month: 3, day: 31 });
    expect(getNairobiDateParts(new Date("2026-03-31T21:00:00.000Z"))).toEqual({ year: 2026, month: 4, day: 1 });
    expect(startOfNairobiDay(new Date("2026-03-31T21:30:00.000Z")).toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("adds calendar days and compares date-only civil dates", () => {
    const januaryFirst = parseDateOfBirth("2026-01-01");
    expect(addCalendarDays(januaryFirst, 90).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(compareNairobiDateOnly("2026-04-01", "2026-03-31")).toBe(86400000);
  });
});
