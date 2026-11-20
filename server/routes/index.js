const express = require("express");
const healthController = require("../controllers/healthController");
const authRoutes = require("./auth.routes");
const donorRoutes = require("./donor.routes");
const patientRoutes = require("./patient.routes");
const hospitalRoutes = require("./hospital.routes");
const ngoRoutes = require("./ngo.routes");
const adminRoutes = require("./admin.routes");
const notificationRoutes = require("./notifications.routes");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    app: "HemoConnect",
    status: "ok",
    version: "1.0.0",
  });
});

router.get("/health", healthController.checkHealth);

router.use("/auth", authRoutes);
router.use("/donor", donorRoutes);
router.use("/patient", patientRoutes);
router.use("/hospital", hospitalRoutes);
router.use("/ngo", ngoRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;