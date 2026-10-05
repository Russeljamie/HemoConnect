const express = require("express");
const healthController = require("../controllers/healthController");
const authRoutes = require("./auth.routes");

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

module.exports = router;