
const { body, validationResult } = require("express-validator");
const { isValidDonorDateOfBirth, parseDateOfBirth } = require("../utils/dateOfBirth");

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];

const registrationValidation = [
  body("firstName")
    .trim()
    .notEmpty().withMessage("First name is required")
    .bail()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),

  body("lastName")
    .trim()
    .notEmpty().withMessage("Last name is required")
    .bail()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),

  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .bail()
    .isEmail().withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("phone")
    .trim()
    .notEmpty().withMessage("Phone number is required")
    .bail()
    .isLength({ min: 10, max: 20 })
    .withMessage("Phone number must be between 10 and 20 characters"),

  body("password")
    .notEmpty().withMessage("Password is required")
    .bail()
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters"),

  body("role")
    .trim()
    .notEmpty().withMessage("Role is required")
    .bail()
    .isIn(["DONOR", "PATIENT"])
    .withMessage("Public registration is only available for donors and patients"),

  body("bloodType")
    .if((value, { req }) => req.body.role === "DONOR")
    .trim()
    .notEmpty().withMessage("Blood type is required for donor registration")
    .bail()
    .isIn(BLOOD_TYPES)
    .withMessage("Please select a valid blood type"),

  body("birthDate")
    .if((value, { req }) => req.body.role === "DONOR")
    .custom((value) => {
      const dateOfBirth = parseDateOfBirth(value);
      return dateOfBirth !== null && isValidDonorDateOfBirth(dateOfBirth);
    })
    .withMessage("Date of birth must represent a donor age between 18 and 100"),

  body("gender")
    .if((value, { req }) => req.body.role === "DONOR")
    .trim()
    .notEmpty().withMessage("Gender is required for donor registration")
    .bail()
    .isIn(GENDERS)
    .withMessage("Please select a valid gender option"),

  body("address")
    .if((value, { req }) => req.body.role === "DONOR")
    .trim()
    .notEmpty().withMessage("Address is required for donor registration")
    .bail()
    .isLength({ max: 255 })
    .withMessage("Address cannot exceed 255 characters"),
];

const loginValidation = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .bail()
    .isEmail().withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required"),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  next();
};

module.exports = {
  registrationValidation,
  loginValidation,
  validate,
};
