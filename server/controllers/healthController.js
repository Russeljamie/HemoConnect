const prisma = require("../services/prisma");
const { sendSuccess, sendError } = require("../utils/response");

const checkHealth = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return sendSuccess(
      res,
      {
        database: "connected",
      },
      "Service is healthy",
      200
    );
  } catch (error) {
    console.error("Health check failed:", error);
    return sendError(
      res,
      "Service is temporarily unavailable",
      503
    );
  }
};

module.exports = {
  checkHealth,
};