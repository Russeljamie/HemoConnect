jest.mock("../services/prisma", () => ({
  $queryRaw: jest.fn(),
}));

const prisma = require("../services/prisma");
const { checkHealth } = require("../controllers/healthController");

describe("health controller", () => {
  it("logs database errors server-side and returns no error details", async () => {
    const databaseError = new Error("sensitive connection details");
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = {
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    prisma.$queryRaw.mockRejectedValue(databaseError);

    try {
      await checkHealth({}, res);

      expect(errorLog).toHaveBeenCalledWith("Health check failed:", databaseError);
    } finally {
      errorLog.mockRestore();
    }

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Service is temporarily unavailable",
    });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("sensitive connection details");
  });
});
