const express = require("express");
const { body, param, query } = require("express-validator");

const {
	getHospitalStaffProfile,
	getHospitalInventory,
	getHospitalStockInsights,
	updateHospitalStockSettings,
	decideHospitalStockThreshold,
	getHospitalStockReport,
	adjustHospitalInventory,
	createHospitalRequest,
	grantPatientAccess,
	listHospitalEnquiries,
	reviewHospitalEnquiry,
	convertHospitalEnquiryToRequest,
	listHospitalPatients,
	listHospitalDonationNeeds,
	createHospitalDonationNeed,
	updateHospitalDonationNeed,
	listHospitalRequests,
	updateHospitalRequest,
	fulfillHospitalRequest,
	listHospitalAppointments,
	listHospitalAppointmentSlots,
	createHospitalAppointmentSlot,
	updateHospitalAppointmentSlot,
	recordHospitalAppointmentDonation,
	updateHospitalAppointment,
	listHospitalStaff,
} = require("../controllers/hospitalController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { validate } = require("../middleware/authValidation");

const router = express.Router();

router.get("/profile", authenticate, authorize("HOSPITAL_STAFF"), getHospitalStaffProfile);
router.get("/inventory", authenticate, authorize("HOSPITAL_STAFF"), getHospitalInventory);
router.get("/stock-insights", authenticate, authorize("HOSPITAL_STAFF"), getHospitalStockInsights);
router.patch(
	"/stock-insights/settings",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("historicalWindowDays").isInt({ min: 7, max: 365 }).withMessage("Choose a history window from 7 to 365 days.").toInt(),
	body("replenishmentLeadTimeDays").isInt({ min: 0, max: 365 }).withMessage("Lead time must be between 0 and 365 days.").toInt(),
	body("safetyBufferDays").isInt({ min: 0, max: 365 }).withMessage("Safety buffer must be between 0 and 365 days.").toInt(),
	validate,
	updateHospitalStockSettings
);
router.get(
	"/stock-insights/reports",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	query("from").optional().isISO8601().withMessage("Enter a valid report start date."),
	query("to").optional().isISO8601().withMessage("Enter a valid report end date."),
	query("bloodType").optional({ values: "falsy" }).isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	query("to").custom((value, { req }) => !value || !req.query.from || new Date(value) >= new Date(req.query.from)).withMessage("Report end date must be on or after the start date."),
	query("to").custom((value, { req }) => !value || !req.query.from || new Date(value) - new Date(req.query.from) <= 366 * 24 * 60 * 60 * 1000).withMessage("Choose a report period no longer than 366 days."),
	validate,
	getHospitalStockReport
);
router.post(
	"/stock-insights/:inventoryId/decision",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("inventoryId").isInt({ min: 1 }).withMessage("Invalid inventory ID."),
	body("decision").isIn(["ACCEPT_RECOMMENDED", "RETAIN_CURRENT", "OVERRIDE"]).withMessage("Select a valid threshold decision."),
	body("minimumUnits").if((value, { req }) => req.body.decision === "OVERRIDE").isInt({ min: 0, max: 100000 }).withMessage("Threshold must be between 0 and 100000 units.").toInt(),
	body("reason").if((value, { req }) => ["RETAIN_CURRENT", "OVERRIDE"].includes(req.body.decision)).trim().isLength({ min: 3, max: 500 }).withMessage("Provide a reason of 3 to 500 characters for this decision."),
	validate,
	decideHospitalStockThreshold
);
router.patch(
	"/inventory",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("bloodType").trim().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	body("unitsChange").isInt({ min: -1000, max: 1000 }).withMessage("Stock change must be between -1000 and 1000 units.").toInt().custom((value) => value !== 0).withMessage("Stock change cannot be zero."),
	body("reason").optional({ values: "falsy" }).trim().isLength({ max: 250 }).withMessage("Reason cannot exceed 250 characters."),
	validate,
	adjustHospitalInventory
);
router.post(
	"/requests",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("patientId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Select a valid patient record.").toInt(),
	body("patient").if((value, { req }) => !req.body.patientId).isObject().withMessage("Enter patient details or select a patient record."),
	body("patient.firstName").if((value, { req }) => !req.body.patientId).trim().isLength({ min: 2, max: 50 }).withMessage("Patient first name is required."),
	body("patient.lastName").if((value, { req }) => !req.body.patientId).trim().isLength({ min: 2, max: 50 }).withMessage("Patient last name is required."),
	body("patient.phone").if((value, { req }) => !req.body.patientId).trim().isLength({ min: 10, max: 20 }).withMessage("Patient phone is required."),
	body("bloodType").trim().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	body("quantityRequired").isInt({ min: 1, max: 20 }).withMessage("Quantity must be between 1 and 20 units.").toInt(),
	body("urgencyLevel").trim().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).withMessage("Select a valid urgency level."),
	body("neededBy").isISO8601().withMessage("Enter a valid needed-by date.").bail().toDate()
		.custom((date) => {
			const neededDay = new Date(date);
			const today = new Date();
			neededDay.setUTCHours(0, 0, 0, 0);
			today.setUTCHours(0, 0, 0, 0);
			if (neededDay < today) throw new Error("Needed-by date cannot be in the past.");
			return true;
		}),
	body("latitude").optional({ values: "falsy" }).isFloat({ min: -90, max: 90 }).withMessage("Enter a valid latitude.").toFloat(),
	body("longitude").optional({ values: "falsy" }).isFloat({ min: -180, max: 180 }).withMessage("Enter a valid longitude.").toFloat(),
	body("notes").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Notes cannot exceed 500 characters."),
	validate,
	createHospitalRequest
);
router.get("/requests", authenticate, authorize("HOSPITAL_STAFF"), listHospitalRequests);
router.get("/patients", authenticate, authorize("HOSPITAL_STAFF"), listHospitalPatients);
router.get("/donation-needs", authenticate, authorize("HOSPITAL_STAFF"), listHospitalDonationNeeds);
router.post(
	"/donation-needs",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("bloodType").trim().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	body("unitsNeeded").isInt({ min: 1, max: 10000 }).withMessage("Units needed must be between 1 and 10000.").toInt(),
	body("neededBy").isISO8601().withMessage("Enter a valid needed-by date.").bail().toDate(),
	body("notes").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Notes cannot exceed 500 characters."),
	validate,
	createHospitalDonationNeed
);
router.patch(
	"/donation-needs/:needId",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("needId").isInt({ min: 1 }).withMessage("Invalid donation need ID."),
	body("status").isIn(["OPEN", "IN_PROGRESS", "FULFILLED", "CANCELLED"]).withMessage("Select a valid donation need status."),
	validate,
	updateHospitalDonationNeed
);
router.get("/enquiries", authenticate, authorize("HOSPITAL_STAFF"), listHospitalEnquiries);
router.post(
	"/enquiries/:enquiryId/review",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("enquiryId").isInt({ min: 1 }).withMessage("Invalid enquiry ID."),
	body("decision").isIn(["VERIFY", "REJECT"]).withMessage("Choose whether to verify or reject this enquiry."),
	body("reviewNotes").optional({ values: "falsy" }).trim().isLength({ max: 1000 }).withMessage("Review notes cannot exceed 1000 characters."),
	validate,
	reviewHospitalEnquiry
);
router.post(
	"/enquiries/:enquiryId/convert",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("enquiryId").isInt({ min: 1 }).withMessage("Invalid enquiry ID."),
	body("latitude").optional({ values: "null" }).isFloat({ min: -90, max: 90 }).withMessage("Enter a valid latitude.").toFloat(),
	body("longitude").optional({ values: "null" }).isFloat({ min: -180, max: 180 }).withMessage("Enter a valid longitude.").toFloat(),
	validate,
	convertHospitalEnquiryToRequest
);
router.post(
	"/patients/:patientId/access",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("patientId").isInt({ min: 1 }).withMessage("Invalid patient ID."),
	body("email").isEmail().withMessage("Enter the family representative's account email."),
	body("relationship").trim().isLength({ min: 2, max: 80 }).withMessage("Enter the representative's relationship to the patient."),
	validate,
	grantPatientAccess
);
router.patch(
	"/requests/:requestId",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("requestId").isInt({ min: 1 }).withMessage("Invalid request ID."),
	body("status").isIn(["IN_PROGRESS", "OPEN"]).withMessage("Status must be IN_PROGRESS or OPEN."),
	validate,
	updateHospitalRequest
);
router.post(
	"/requests/:requestId/fulfill",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("requestId").isInt({ min: 1 }).withMessage("Invalid request ID."),
	body("quantity").isInt({ min: 1, max: 20 }).withMessage("Fulfilled quantity must be between 1 and 20 units.").toInt(),
	body("outcomeNotes").optional({ values: "falsy" }).trim().isLength({ max: 1000 }).withMessage("Outcome notes cannot exceed 1000 characters."),
	validate,
	fulfillHospitalRequest
);
router.get("/appointments", authenticate, authorize("HOSPITAL_STAFF"), listHospitalAppointments);
router.get("/appointments/slots", authenticate, authorize("HOSPITAL_STAFF"), listHospitalAppointmentSlots);
router.post(
	"/appointments/slots",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("date").isISO8601().withMessage("Enter a valid appointment date.").bail().custom((value) => {
		const date = new Date(`${value}T00:00:00`);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (!Number.isFinite(date.getTime()) || date < today) throw new Error("Appointment date cannot be in the past.");
		return true;
	}),
	body("time").matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/).withMessage("Enter a valid time."),
	body("capacity").isInt({ min: 1, max: 100 }).withMessage("Capacity must be between 1 and 100.").toInt(),
	validate,
	createHospitalAppointmentSlot
);
router.patch(
	"/appointments/slots/:slotId",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("slotId").isInt({ min: 1 }).withMessage("Invalid appointment slot ID."),
	body("status").isIn(["OPEN", "CLOSED"]).withMessage("Slot status must be OPEN or CLOSED."),
	validate,
	updateHospitalAppointmentSlot
);
router.patch(
	"/appointments/:appointmentId/status",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("appointmentId").isInt({ min: 1 }).withMessage("Invalid appointment ID."),
	body("status").isIn(["CONFIRMED", "COMPLETED", "CANCELLED"]).withMessage("Select a valid appointment status."),
	validate,
	updateHospitalAppointment
);
router.post(
	"/appointments/:appointmentId/donation",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("appointmentId").isInt({ min: 1 }).withMessage("Invalid appointment ID."),
	body("quantity").isInt({ min: 1, max: 1000 }).withMessage("Donation quantity must be between 1 and 1000 ml.").toInt(),
	body("notes").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Notes cannot exceed 500 characters."),
	validate,
	recordHospitalAppointmentDonation
);
router.get("/staff", authenticate, authorize("HOSPITAL_STAFF"), listHospitalStaff);

module.exports = router;
