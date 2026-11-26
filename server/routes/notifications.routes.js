const express = require("express");
const { param } = require("express-validator");

const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  receiveSmsDeliveryReport,
} = require("../controllers/notificationController");
const authenticate = require("../middleware/authenticate");
const { validate } = require("../middleware/authValidation");

const router = express.Router();

router.post("/sms/delivery-reports", receiveSmsDeliveryReport);
router.get("/", authenticate, listNotifications);
router.patch("/read-all", authenticate, markAllNotificationsRead);
router.patch(
  "/:notificationId/read",
  authenticate,
  param("notificationId").isInt({ min: 1 }).withMessage("Invalid notification ID."),
  validate,
  markNotificationRead
);

module.exports = router;
