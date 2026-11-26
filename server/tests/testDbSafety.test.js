const {
  assertTestDatabaseIdentity,
  validateTestDatabaseUrls,
} = require("../../scripts/test-db-safety");

const developmentDatabaseUrl = "postgresql://localhost:5432/Hemoconnect";
const testDatabaseUrl = "postgresql://localhost:5432/hemoconnect_test";

describe("test database URL safety", () => {
  test.each([
    ["Hemoconnect", "postgresql://localhost:5432/Hemoconnect"],
    ["development database name", "postgresql://localhost:5432/hemoconnect_dev"],
    ["suffix-only test database name", "postgresql://localhost:5432/hemoconnect_not_test"],
  ])("rejects %s", (_description, databaseUrl) => {
    expect(() =>
      validateTestDatabaseUrls(databaseUrl, developmentDatabaseUrl)
    ).toThrow(/must be "hemoconnect_test"/);
  });

  test("rejects the test database on a non-local host", () => {
    expect(() =>
      validateTestDatabaseUrls(
        "postgresql://db.example.invalid:5432/hemoconnect_test",
        developmentDatabaseUrl
      )
    ).toThrow(/non-local host "db\.example\.invalid"/);
  });

  test("rejects a test URL equal to the development database URL", () => {
    expect(() =>
      validateTestDatabaseUrls(testDatabaseUrl, testDatabaseUrl)
    ).toThrow(/matches development database "hemoconnect_test"/);
  });

  test("accepts hemoconnect_test on localhost when development uses a different database", () => {
    expect(
      validateTestDatabaseUrls(testDatabaseUrl, developmentDatabaseUrl)
    ).toEqual({ databaseName: "hemoconnect_test", host: "localhost" });
  });

  test("accepts only the actual hemoconnect_test database identity", () => {
    expect(assertTestDatabaseIdentity("hemoconnect_test")).toBe("hemoconnect_test");
    expect(() => assertTestDatabaseIdentity("Hemoconnect"))
      .toThrow(/connected database "Hemoconnect" must be "hemoconnect_test"/);
  });
});
