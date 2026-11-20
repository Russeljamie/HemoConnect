const prisma = require("../services/prisma");

const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists. Please log in again.",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Authenticated user retrieved successfully",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMe };
