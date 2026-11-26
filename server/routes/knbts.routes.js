const express = require("express");
const { body, param, query } = require("express-validator");
const { getKnbtsStaffProfile } = require("../controllers/knbtsController");
const questionnaireController = require("../controllers/knbtsQuestionnaireController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { validate } = require("../middleware/authValidation");

const router = express.Router();

router.get("/profile", authenticate, authorize("KNBTS_STAFF"), getKnbtsStaffProfile);

router.get(
  "/questionnaire/submissions",
  authenticate,
  authorize("KNBTS_STAFF"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Page size must be between 1 and 100."),
  query("dashboard").optional().isIn(["true", "false"]).withMessage("Dashboard must be true or false."),
  validate,
  questionnaireController.listPendingSubmissions
);

router.get(
  "/questionnaire/queue",
  authenticate,
  authorize("KNBTS_STAFF"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Page size must be between 1 and 100."),
  query("dashboard").optional().isIn(["true", "false"]).withMessage("Dashboard must be true or false."),
  validate,
  questionnaireController.listPendingSubmissions
);

router.get(
  "/questionnaire/submissions/:submissionId",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  validate,
  questionnaireController.getSubmission
);

router.post(
  "/questionnaire/submissions/:submissionId/review",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  body("decision").isIn(["APPROVED", "DECLINED"]).withMessage("Decision must be APPROVED or DECLINED."),
  validate,
  questionnaireController.recordReview
);

router.post(
  "/questionnaire/submissions/:submissionId/assessment",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  body("decision").isIn(["ACCEPT", "DEFER"]).withMessage("Decision must be ACCEPT or DEFER."),
  validate,
  questionnaireController.recordAssessment
);

router.post(
  "/questionnaire/submissions/:submissionId/assessments",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  body("decision").isIn(["ACCEPT", "DEFER"]).withMessage("Decision must be ACCEPT or DEFER."),
  validate,
  questionnaireController.recordAssessment
);

router.post(
  "/questionnaire/submissions/:submissionId/clinical-assessment",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  body("decision").isIn(["ACCEPT", "DEFER"]).withMessage("Decision must be ACCEPT or DEFER."),
  validate,
  questionnaireController.recordAssessment
);

router.post(
  "/questionnaire/submissions/:submissionId/clinical-assessments",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  body("decision").isIn(["ACCEPT", "DEFER"]).withMessage("Decision must be ACCEPT or DEFER."),
  validate,
  questionnaireController.recordAssessment
);

router.post(
  "/questionnaire/submissions/:submissionId/approval",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  validate,
  questionnaireController.issueApproval
);

router.post(
  "/questionnaire/submissions/:submissionId/approve",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("submissionId").isInt({ min: 1 }).withMessage("Invalid submission ID."),
  validate,
  questionnaireController.issueApproval
);

router.get(
  "/questionnaire/approvals",
  authenticate,
  authorize("KNBTS_STAFF"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Page size must be between 1 and 100."),
  query("status").optional().isIn(["ACTIVE", "CONSUMED", "EXPIRED"]).withMessage("Invalid approval status."),
  validate,
  questionnaireController.listApprovals
);

router.get(
  "/questionnaire/approvals/:approvalId",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("approvalId").isInt({ min: 1 }).withMessage("Invalid approval ID."),
  validate,
  questionnaireController.getApproval
);

router.get(
  "/questionnaire/approvals/:approvalId/valid",
  authenticate,
  authorize("KNBTS_STAFF"),
  param("approvalId").isInt({ min: 1 }).withMessage("Invalid approval ID."),
  validate,
  questionnaireController.getApproval
);

module.exports = router;
