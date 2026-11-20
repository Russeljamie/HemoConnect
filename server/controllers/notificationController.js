const prisma = require("../services/prisma");

const listNotifications = async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.userId },
        include: { campaign: { select: { campaignId: true, name: true } } },
        orderBy: [{ createdAt: "desc" }, { notificationId: "desc" }],
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: req.user.userId, readAt: null },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: { notifications, unreadCount },
    });
  } catch (error) {
    next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const notificationId = Number(req.params.notificationId);
    const notification = await prisma.notification.findFirst({
      where: { notificationId, userId: req.user.userId },
      select: { notificationId: true, readAt: true },
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const readAt = notification.readAt || new Date();
    if (!notification.readAt) {
      await prisma.notification.updateMany({
        where: { notificationId, userId: req.user.userId, readAt: null },
        data: { readAt, status: "READ" },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: { notificationId, readAt },
    });
  } catch (error) {
    next(error);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, readAt: null },
      data: { readAt: new Date(), status: "READ" },
    });

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };
