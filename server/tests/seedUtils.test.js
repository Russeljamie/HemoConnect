const { generateBirthDateForAge } = require("../../prisma/seedUtils");

function ageOnDate(birthDate, today) {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

describe("generateBirthDateForAge", () => {
  it("generates valid dates for the requested age", () => {
    const today = new Date("2026-11-02T00:00:00.000Z");
    const ages = [18, 21, 27, 39, 100];

    for (const age of ages) {
      for (let sample = 0; sample < 20; sample += 1) {
        const birthDate = generateBirthDateForAge(age, today);
        expect(birthDate.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
        expect(ageOnDate(birthDate, today)).toBe(age);
      }
    }
  });

  it("distributes generated birth dates across months and days", () => {
    const today = new Date("2026-11-02T00:00:00.000Z");
    let randomState = 123456789;
    const random = () => {
      randomState = (1664525 * randomState + 1013904223) % 4294967296;
      return randomState / 4294967296;
    };
    const birthDates = Array.from(
      { length: 1200 },
      () => generateBirthDateForAge(30, today, random)
    );
    const months = new Set(birthDates.map((date) => date.getUTCMonth()));
    const monthDays = new Set(
      birthDates.map((date) => `${date.getUTCMonth()}-${date.getUTCDate()}`)
    );

    expect(months.size).toBe(12);
    expect(monthDays.size).toBeGreaterThan(300);
  });

  it("rejects ages outside the supported range", () => {
    expect(() => generateBirthDateForAge(-1)).toThrow(RangeError);
    expect(() => generateBirthDateForAge(121)).toThrow(RangeError);
  });
});
