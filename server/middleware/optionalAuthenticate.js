const jwt = require("jsonwebtoken");
const env = require("../config/env");

const optionalAuthenticate = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) return next();

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Invalid authorization header." });
  }

  try {
    const decoded = jwt.verify(authorization.slice(7).trim(), env.JWT_SECRET);
    if (!decoded || !Number.isInteger(decoded.userId) || typeof decoded.role !== "string") {
      return res.status(401).json({ success: false, message: "Invalid authentication token." });
    }

    req.user = { userId: decoded.userId, role: decoded.role };
    return next();
  } catch (error) {
    if (["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
    }
    return next(error);
  }
};

module.exports = optionalAuthenticate;
