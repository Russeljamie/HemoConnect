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
    return sendError(
      res,
      "Database connection failed",
      503,
      {
        message: error.message,
      }
    );
  }
};

module.exports = {
  checkHealth,
};