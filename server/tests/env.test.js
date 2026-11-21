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
