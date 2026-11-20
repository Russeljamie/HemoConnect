const express = require("express");
const { body, param, query } = require("express-validator");

const {
	getNgoProfile,
	listNgoCampaigns,
	listNgoHospitalNeeds,
	createNgoCampaign,
	updateNgoCampaign,
	listNgoOutreachActivities,
	createNgoOutreachActivity,
	updateNgoOutreachActivity,
	listNgoNotifications,
	markNgoNotificationRead,
	markAllNgoNotificationsRead,
	getNgoReports,
} = require("../controllers/ngoController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { validate } = require("../middleware/authValidation");

const router = express.Router();

router.get("/profile", authenticate, authorize("NGO"), getNgoProfile);
router.get("/campaigns", authenticate, authorize("NGO"), listNgoCampaigns);
router.get("/donation-needs", authenticate, authorize("NGO"), listNgoHospitalNeeds);
router.post(
	"/campaigns",
	authenticate,
	authorize("NGO"),
	body("name").trim().isLength({ min: 3, max: 120 }).withMessage("Campaign name must be 3 to 120 characters."),
	body("description").trim().isLength({ min: 10, max: 2000 }).withMessage("Description must be 10 to 2000 characters."),
	body("startDate").isISO8601().withMessage("Enter a valid start date.").bail().toDate(),
	body("endDate").isISO8601().withMessage("Enter a valid end date.").bail().toDate(),
	body("location").trim().isLength({ min: 2, max: 180 }).withMessage("Location must be 2 to 180 characters."),
	body("hospitalId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Select a valid hospital.").toInt(),
	body("hospitalNeedId").optional({ values: "null" }).isInt({ min: 1 }).withMessage("Select a valid hospital donation need.").toInt(),
	validate,
	createNgoCampaign
);
router.patch(
	"/campaigns/:campaignId",
	authenticate,
	authorize("NGO"),
	param("campaignId").isInt({ min: 1 }).withMessage("Invalid campaign ID."),
	body("name").optional().trim().isLength({ min: 3, max: 120 }).withMessage("Campaign name must be 3 to 120 characters."),
	body("description").optional().trim().isLength({ min: 10, max: 2000 }).withMessage("Description must be 10 to 2000 characters."),
	body("startDate").optional().isISO8601().withMessage("Enter a valid start date.").bail().toDate(),
	body("endDate").optional().isISO8601().withMessage("Enter a valid end date.").bail().toDate(),
	body("location").optional().trim().isLength({ min: 2, max: 180 }).withMessage("Location must be 2 to 180 characters."),
	body("hospitalId").optional({ values: "null" }).isInt({ min: 1 }).withMessage("Select a valid hospital.").toInt(),
	body("hospitalNeedId").optional({ values: "null" }).isInt({ min: 1 }).withMessage("Select a valid hospital donation need.").toInt(),
	body("status").optional().isIn(["ACTIVE", "COMPLETED", "CANCELLED"]).withMessage("Select a valid campaign status."),
	validate,
	updateNgoCampaign
);
router.get("/outreach", authenticate, authorize("NGO"), listNgoOutreachActivities);
router.post(
	"/outreach",
	authenticate,
	authorize("NGO"),
	body("title").trim().isLength({ min: 3, max: 120 }).withMessage("Activity title must be 3 to 120 characters."),
	body("activityType").isIn(["COMMUNITY_VISIT", "SCHOOL_OUTREACH", "CORPORATE_DRIVE", "AWARENESS", "OTHER"]).withMessage("Select a valid activity type."),
	body("description").trim().isLength({ min: 10, max: 2000 }).withMessage("Description must be 10 to 2000 characters."),
	body("location").trim().isLength({ min: 2, max: 180 }).withMessage("Location must be 2 to 180 characters."),
	body("scheduledAt").isISO8601().withMessage("Enter a valid activity date.").bail().toDate(),
	body("campaignId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Select a valid campaign.").toInt(),
	validate,
	createNgoOutreachActivity
);
router.patch(
	"/outreach/:activityId",
	authenticate,
	authorize("NGO"),
	param("activityId").isInt({ min: 1 }).withMessage("Invalid activity ID."),
	body("title").optional().trim().isLength({ min: 3, max: 120 }).withMessage("Activity title must be 3 to 120 characters."),
	body("activityType").optional().isIn(["COMMUNITY_VISIT", "SCHOOL_OUTREACH", "CORPORATE_DRIVE", "AWARENESS", "OTHER"]).withMessage("Select a valid activity type."),
	body("description").optional().trim().isLength({ min: 10, max: 2000 }).withMessage("Description must be 10 to 2000 characters."),
	body("location").optional().trim().isLength({ min: 2, max: 180 }).withMessage("Location must be 2 to 180 characters."),
	body("scheduledAt").optional().isISO8601().withMessage("Enter a valid activity date.").bail().toDate(),
	body("campaignId").optional({ values: "null" }).isInt({ min: 1 }).withMessage("Select a valid campaign.").toInt(),
	body("peopleReached").optional().isInt({ min: 0, max: 100000 }).withMessage("People reached must be between 0 and 100000.").toInt(),
	body("status").optional().isIn(["IN_PROGRESS", "COMPLETED", "CANCELLED"]).withMessage("Select a valid activity status."),
	validate,
	updateNgoOutreachActivity
);
router.get("/notifications", authenticate, authorize("NGO"), listNgoNotifications);
router.patch("/notifications/read-all", authenticate, authorize("NGO"), markAllNgoNotificationsRead);
router.patch(
	"/notifications/:notificationId/read",
	authenticate,
	authorize("NGO"),
	param("notificationId").isInt({ min: 1 }).withMessage("Invalid notification ID."),
	validate,
	markNgoNotificationRead
);
router.get(
	"/reports",
	authenticate,
	authorize("NGO"),
	query("from").optional().isISO8601().withMessage("Enter a valid report start date.").bail().toDate(),
	query("to").optional().isISO8601().withMessage("Enter a valid report end date.").bail().toDate(),
	validate,
	getNgoReports
);

module.exports = router;
