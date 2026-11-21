const express = require("express");
const { body } = require("express-validator");
const rateLimit = require("express-rate-limit");

const {
  register,
  login,
  changePassword,
  requestPasswordReset,
  resetPassword,
} = require("../controllers/authController");

const {
  getMe,
} = require("../controllers/currentUserController");

const {
  registrationValidation,
  loginValidation,
  validate,
} = require("../middleware/authValidation");

const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

// Public registration
router.post(
  "/register",
  authRateLimiter,
  registrationValidation,
  validate,
  register
);

// Public login
router.post(
  "/login",
  authRateLimiter,
  loginValidation,
  validate,
  login
);

router.post(
  "/password-reset/request",
  authRateLimiter,
  body("email").trim().isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  validate,
  requestPasswordReset
);

router.post(
  "/password-reset/confirm",
  authRateLimiter,
  body("token").isString().isLength({ min: 32, max: 100 }).withMessage("Password reset token is invalid."),
  body("newPassword").isString().isLength({ min: 12, max: 128 }).withMessage("New password must be between 12 and 128 characters."),
  validate,
  resetPassword
);

router.post(
  "/change-password",
  authenticate,
  body("currentPassword").isString().notEmpty().withMessage("Current password is required."),
  body("newPassword").isString().isLength({ min: 12, max: 128 }).withMessage("New password must be between 12 and 128 characters."),
  validate,
  changePassword
);

router.get(
  "/role-access",
  authenticate,
  authorize("DONOR", "PATIENT", "HOSPITAL_STAFF", "NGO", "ADMIN"),
  (req, res) => {
    const dashboardMap = {
      DONOR: "donor-dashboard",
      PATIENT: "patient-dashboard",
      HOSPITAL_STAFF: "hospital-dashboard",
      NGO: "ngo-dashboard",
      ADMIN: "admin-dashboard",
    };

    return res.status(200).json({
      success: true,
      message: "Role access verified",
      data: {
        role: req.user.role,
        dashboard: dashboardMap[req.user.role] || "dashboard",
      },
    });
  }
);

// Protected current-user endpoint
router.get("/me", authenticate, getMe);

module.exports = router;
