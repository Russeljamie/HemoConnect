const jwt = require("jsonwebtoken");
const env = require("../config/env");
const prisma = require("../services/prisma");

const authenticate = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is missing.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);

    if (
      !decoded ||
      !Number.isInteger(decoded.userId) ||
      typeof decoded.role !== "string"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    return next(error);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { userId: decoded.userId },
      select: { role: true, status: true, mustChangePassword: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "The account for this authentication token no longer exists.",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "This account is deactivated.",
      });
    }

    req.user = {
      userId: decoded.userId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = authenticate;
