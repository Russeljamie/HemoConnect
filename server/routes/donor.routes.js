const express = require("express");

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
router.get("/alerts", authenticate, authorize("DONOR"), listDonorEmergencyAlerts);
router.post("/alerts/:requestId/respond", authenticate, authorize("DONOR"), respondToDonorAlert);

module.exports = router;
