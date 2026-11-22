const express = require("express");
const { body, param, query } = require("express-validator");

const {
	getHospitalStaffProfile,
	getHospitalInventory,
	getHospitalInventoryTransactions,
	updateHospitalInventoryMinimum,
	adjustHospitalInventory,
	createHospitalRequest,
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
router.get(
	"/inventory/transactions",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	query("from").optional().isISO8601().withMessage("Enter a valid report start date."),
	query("to").optional().isISO8601().withMessage("Enter a valid report end date."),
	query("bloodType").optional({ values: "falsy" }).isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	query("to").custom((value, { req }) => !value || !req.query.from || new Date(value) >= new Date(req.query.from)).withMessage("Report end date must be on or after the start date."),
	query("to").custom((value, { req }) => !value || !req.query.from || new Date(value) - new Date(req.query.from) <= 366 * 24 * 60 * 60 * 1000).withMessage("Choose a report period no longer than 366 days."),
	validate,
	getHospitalInventoryTransactions
);
router.patch(
	"/inventory/:inventoryId/minimum",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	param("inventoryId").isInt({ min: 1 }).withMessage("Invalid inventory ID."),
	body("minimumUnits").isInt({ min: 0, max: 100000 }).withMessage("Minimum stock must be between 0 and 100000 units.").toInt(),
	validate,
	updateHospitalInventoryMinimum
);
router.patch(
	"/inventory",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("bloodType").trim().isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).withMessage("Select a valid blood type."),
	body("unitsChange").isInt({ min: -1000, max: 1000 }).withMessage("Stock change must be between -1000 and 1000 units.").toInt().custom((value) => value !== 0).withMessage("Stock change cannot be zero."),
	body("reason").trim().isLength({ min: 3, max: 250 }).withMessage("Provide a reason of 3 to 250 characters."),
	validate,
	adjustHospitalInventory
);
router.post(
	"/requests",
	authenticate,
	authorize("HOSPITAL_STAFF"),
	body("patientId").custom((value) => value === undefined).withMessage("Patient records are no longer supported."),
	body("patient").custom((value) => value === undefined).withMessage("Patient detail fields are no longer supported."),
	body("patientReference").optional({ values: "falsy" }).trim().isLength({ max: 60 }).withMessage("Patient or case reference cannot exceed 60 characters."),
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
