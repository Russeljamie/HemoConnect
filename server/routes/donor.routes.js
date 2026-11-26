const express = require("express");
const { body, param } = require("express-validator");

const {
	getDonorProfile,
	updateDonorProfile,
	listDonorDonations,
	getDonorDonation,
	listDonorAppointments,
	listNearbyDonorHospitals,
	listDonorAppointmentSlots,
	createDonorAppointment,
	cancelDonorAppointment,
	listDonorEmergencyAlerts,
	respondToDonorAlert,
} = require("../controllers/donorController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { validate } = require("../middleware/authValidation");
const questionnaireController = require("../controllers/questionnaireController");

const router = express.Router();

router.get("/profile", authenticate, authorize("DONOR"), getDonorProfile);
router.patch("/profile", authenticate, authorize("DONOR"), updateDonorProfile);
router.get("/donations", authenticate, authorize("DONOR"), listDonorDonations);
router.get("/donations/:donationId", authenticate, authorize("DONOR"), getDonorDonation);
router.get("/appointments", authenticate, authorize("DONOR"), listDonorAppointments);
router.get("/appointments/nearby", authenticate, authorize("DONOR"), listNearbyDonorHospitals);
router.get("/appointments/slots", authenticate, authorize("DONOR"), listDonorAppointmentSlots);
router.post("/appointments", authenticate, authorize("DONOR"), createDonorAppointment);
router.patch(
	"/appointments/:appointmentId/cancel",
	authenticate,
	authorize("DONOR"),
	cancelDonorAppointment
);
router.get(
	"/questionnaire/current",
	authenticate,
	authorize("DONOR"),
	questionnaireController.getPublishedQuestionnaire
);
router.post(
	"/questionnaire/submissions",
	authenticate,
	authorize("DONOR"),
	questionnaireController.createDraftSubmission
);
router.get(
	"/questionnaire/submissions",
	authenticate,
	authorize("DONOR"),
	questionnaireController.listOwnSubmissions
);
router.get(
	"/questionnaire/submissions/:submissionId",
	authenticate,
	authorize("DONOR"),
	param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
	validate,
	questionnaireController.getOwnSubmission
);
router.put(
	"/questionnaire/submissions/:submissionId/answers",
	authenticate,
	authorize("DONOR"),
	param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
	body("answers").isArray({ min: 1, max: 200 }).withMessage("Provide between 1 and 200 answers."),
	body("answers.*.questionId").isInt({ min: 1 }).withMessage("Each answer requires a valid question ID."),
	validate,
	questionnaireController.saveDraftAnswers
);
router.delete(
	"/questionnaire/submissions/:submissionId/answers/:questionId",
	authenticate,
	authorize("DONOR"),
	param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
	param("questionId").isInt({ min: 1 }).withMessage("Invalid question ID."),
	validate,
	questionnaireController.deleteDraftAnswer
);
router.post(
	"/questionnaire/submissions/:submissionId/submit",
	authenticate,
	authorize("DONOR"),
	param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
	body("declarationAcknowledged").custom((value) => value === true)
		.withMessage("Confirm the declaration before submitting."),
	validate,
	questionnaireController.finalizeSubmission
);
router.get("/alerts", authenticate, authorize("DONOR"), listDonorEmergencyAlerts);
router.post("/alerts/:requestId/respond", authenticate, authorize("DONOR"), respondToDonorAlert);

module.exports = router;
