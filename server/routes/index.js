const express = require("express");
const healthController = require("../controllers/healthController");
const authRoutes = require("./auth.routes");
const donorRoutes = require("./donor.routes");
const hospitalRoutes = require("./hospital.routes");
const knbtsRoutes = require("./knbts.routes");
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
router.use("/hospital", hospitalRoutes);
router.use("/knbts", knbtsRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;