describe("JWT secret production configuration", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    jest.resetModules();
  });

  it.each([
    ["missing", ""],
    ["short", "short-secret"],
  ])("fails in production when JWT_SECRET is %s", (_description, secret) => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = secret;

    expect(() => require("../config/env")).toThrow(
      "JWT_SECRET must be set to at least 32 characters in production."
    );
  });
});

describe("DONATION_WAITING_PERIOD_DAYS configuration", () => {
  const originalWaitingPeriod = process.env.DONATION_WAITING_PERIOD_DAYS;

  afterEach(() => {
    if (originalWaitingPeriod === undefined) {
      delete process.env.DONATION_WAITING_PERIOD_DAYS;
    } else {
      process.env.DONATION_WAITING_PERIOD_DAYS = originalWaitingPeriod;
    }
    jest.resetModules();
  });

  it("uses 90 when missing", () => {
    delete process.env.DONATION_WAITING_PERIOD_DAYS;
    jest.resetModules();
    expect(require("../config/env").DONATION_WAITING_PERIOD_DAYS).toBe(90);
  });

  it("accepts a positive integer", () => {
    process.env.DONATION_WAITING_PERIOD_DAYS = "45";
    jest.resetModules();
    expect(require("../config/env").DONATION_WAITING_PERIOD_DAYS).toBe(45);
  });

  it.each(["0", "-1", "1.5", "not-a-number", "", "   "])(
    "rejects invalid value %p",
    (value) => {
      process.env.DONATION_WAITING_PERIOD_DAYS = value;
      jest.resetModules();
      expect(() => require("../config/env")).toThrow("DONATION_WAITING_PERIOD_DAYS must be a positive integer.");
    }
  );
});
