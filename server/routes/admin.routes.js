const express = require("express");
const { body, param, query } = require("express-validator");

const {
	getAdminDashboard,
	listAdminUsers,
	updateAdminUserStatus,
	createAdminHospitalStaff,
	listAdminHospitals,
	createAdminHospital,
	updateAdminHospitalStatus,
	listAdminInventory,
} = require("../controllers/adminController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { validate } = require("../middleware/authValidation");

const router = express.Router();

router.get("/dashboard", authenticate, authorize("ADMIN"), getAdminDashboard);
router.get("/users", authenticate, authorize("ADMIN"), listAdminUsers);
router.patch(
	"/users/:userId/status",
	authenticate,
	authorize("ADMIN"),
	param("userId").isInt({ min: 1 }).withMessage("Invalid user ID.").toInt(),
	body("status").isIn(["ACTIVE", "INACTIVE"]).withMessage("Status must be ACTIVE or INACTIVE."),
	validate,
	updateAdminUserStatus
);
router.post(
	"/hospital-staff",
	authenticate,
	authorize("ADMIN"),
	body("firstName").trim().isLength({ min: 2, max: 50 }).withMessage("First name must be between 2 and 50 characters."),
	body("lastName").trim().isLength({ min: 2, max: 50 }).withMessage("Last name must be between 2 and 50 characters."),
	body("email").trim().isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
	body("phone").trim().isLength({ min: 10, max: 20 }).withMessage("Phone number must be between 10 and 20 characters."),
	body("designation").trim().isLength({ min: 2, max: 100 }).withMessage("Designation must be between 2 and 100 characters."),
	body("hospitalId").isInt({ min: 1 }).withMessage("Select a valid hospital.").toInt(),
	body("temporaryPassword").isLength({ min: 12, max: 128 }).withMessage("Temporary password must be between 12 and 128 characters."),
	validate,
	createAdminHospitalStaff
);
router.get(
	"/hospitals",
	authenticate,
	authorize("ADMIN"),
	query("institutionType").optional({ values: "falsy" }).isIn(["HOSPITAL", "KNBTS_CENTRE"]).withMessage("Select a valid institution type."),
	validate,
	listAdminHospitals
);
router.post(
	"/hospitals",
	authenticate,
	authorize("ADMIN"),
	body("name").trim().isLength({ min: 2, max: 150 }).withMessage("Hospital name must be between 2 and 150 characters."),
	body("location").trim().isLength({ min: 3, max: 255 }).withMessage("Hospital address must be between 3 and 255 characters."),
	body("contactInfo").trim().isLength({ min: 3, max: 100 }).withMessage("Enter hospital contact details."),
	body("latitude").isFloat({ min: -90, max: 90 }).withMessage("Enter a valid latitude.").toFloat(),
	body("longitude").isFloat({ min: -180, max: 180 }).withMessage("Enter a valid longitude.").toFloat(),
	body("institutionType").optional().isIn(["HOSPITAL", "KNBTS_CENTRE"]).withMessage("Select a valid institution type."),
	validate,
	createAdminHospital
);
router.patch(
	"/hospitals/:hospitalId/status",
	authenticate,
	authorize("ADMIN"),
	param("hospitalId").isInt({ min: 1 }).withMessage("Invalid hospital ID.").toInt(),
	body("status").isIn(["ACTIVE", "INACTIVE"]).withMessage("Status must be ACTIVE or INACTIVE."),
	validate,
	updateAdminHospitalStatus
);
router.get("/inventory", authenticate, authorize("ADMIN"), listAdminInventory);

module.exports = router;