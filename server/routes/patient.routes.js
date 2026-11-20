const express = require("express");
const { body, param } = require("express-validator");

const {
	getPatientProfile,
	listPatientAppointments,
	listPatientMedicalNotes,
	listPatientRequests,
	listPublicHospitals,
	createAssistanceEnquiry,
	markPatientNotificationRead,
} = require("../controllers/patientController");
const authenticate = require("../middleware/authenticate");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const authorize = require("../middleware/authorize");
const { validate } = require("../middleware/authValidation");

const router = express.Router();

router.get("/profile", authenticate, authorize("PATIENT"), getPatientProfile);
router.get("/appointments", authenticate, authorize("PATIENT"), listPatientAppointments);
router.get("/medical-notes", authenticate, authorize("PATIENT"), listPatientMedicalNotes);
router.get("/requests", authenticate, authorize("PATIENT"), listPatientRequests);
router.get("/hospitals", listPublicHospitals);
router.patch(
	"/notifications/:notificationId/read",
	authenticate,
	authorize("PATIENT"),
	param("notificationId").isInt({ min: 1 }).withMessage("Invalid notification ID."),
	validate,
	markPatientNotificationRead
);
router.post(
	"/enquiries",
	optionalAuthenticate,
	body("firstName").if((value, { req }) => !req.user).trim().isLength({ min: 2, max: 50 }).withMessage("Patient first name is required."),
	body("lastName").if((value, { req }) => !req.user).trim().isLength({ min: 2, max: 50 }).withMessage("Patient last name is required."),
	body("phone").if((value, { req }) => !req.user).trim().isLength({ min: 10, max: 20 }).withMessage("A contact phone number is required."),
	body("submitterName").if((value, { req }) => !req.user).trim().isLength({ min: 2, max: 100 }).withMessage("Your name is required."),
	body("submitterEmail").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid contact email."),
	body("patientId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Select a valid patient record.").toInt(),
	body("preferredHospitalId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Select a valid hospital.").toInt(),
	body("description").trim().isLength({ min: 10, max: 2000 }).withMessage("Describe the assistance needed (10 to 2000 characters)."),
	body("bloodType").trim().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	body("quantityRequired").isInt({ min: 1, max: 20 }).withMessage("Quantity must be between 1 and 20 units.").toInt(),
	body("urgencyLevel").trim().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).withMessage("Select a valid urgency level."),
	body("latitude").optional({ values: "falsy" }).isFloat({ min: -90, max: 90 }).withMessage("Enter a valid request latitude.").toFloat(),
	body("longitude").optional({ values: "falsy" }).isFloat({ min: -180, max: 180 }).withMessage("Enter a valid request longitude.").toFloat(),
	body("neededBy")
		.isISO8601().withMessage("Enter a valid needed-by date.")
		.bail()
		.toDate()
		.custom((date) => {
			const neededByDay = new Date(date);
			const today = new Date();
			neededByDay.setUTCHours(0, 0, 0, 0);
			today.setUTCHours(0, 0, 0, 0);
			if (neededByDay < today) throw new Error("Needed-by date cannot be in the past.");
			return true;
		}),
	validate,
	createAssistanceEnquiry
);

module.exports = router;
