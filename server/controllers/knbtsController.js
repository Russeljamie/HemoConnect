const prisma = require("../services/prisma");

const getKnbtsStaffProfile = async (req, res, next) => {
  try {
    const staffProfile = await prisma.knbtsStaff.findUnique({
      where: { userId: req.user.userId },
      select: {
        knbtsStaffId: true,
        designation: true,
        createdAt: true,
        centre: {
          select: {
            hospitalId: true,
            name: true,
            location: true,
            latitude: true,
            longitude: true,
            institutionType: true,
          },
        },
      },
    });

    if (!staffProfile) {
      return res.status(404).json({
        success: false,
        message: "KNBTS staff profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "KNBTS staff profile retrieved successfully.",
      data: { staff: staffProfile },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getKnbtsStaffProfile };
