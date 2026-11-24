const prisma = require("../services/prisma");
const env = require("../config/env");
const {
  updateSmsDeliveryReport,
  verifyMobileSasaWebhook,
} = require("../services/sms");

const receiveSmsDeliveryReport = async (req, res, next) => {
  if (!env.MOBILESASA_WEBHOOK_SECRET) {
    return res.status(503).json({ success: false, message: "SMS delivery reports are not configured." });
  }
  if (!verifyMobileSasaWebhook(req.rawBody, req.headers)) {
    return res.status(401).json({ success: false, message: "Invalid SMS delivery report signature." });
  }

  try {
    const updated = await updateSmsDeliveryReport(req.body || {});
    return res.status(200).json({ success: true, processed: updated });
  } catch (error) {
    next(error);
  }
};

const listNotifications = async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.userId },
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

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  receiveSmsDeliveryReport,
};
