const express = require("express");

const {
  register,
  login,
} = require("../controllers/authController");

const {
  registrationValidation,
  loginValidation,
  validate,
} = require("../middleware/authValidation");

const router = express.Router();

// Registration
router.post(
  "/register",
  registrationValidation,
  validate,
  register
);

// Login
router.post(
  "/login",
  loginValidation,
  validate,
  login
);

module.exports = router;