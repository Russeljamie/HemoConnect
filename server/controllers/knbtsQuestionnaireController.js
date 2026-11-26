const knbtsQuestionnaireService = require("../services/knbtsQuestionnaireService");
const { sendSuccess, sendError } = require("../utils/response");

const run = (operation, successMessage, statusCode = 200) => async (req, res, next) => {
  try {
    const result = await operation(req);
    return sendSuccess(res, result, successMessage, statusCode);
  } catch (error) {
    if (error instanceof knbtsQuestionnaireService.KnbtsQuestionnaireError) {
      return sendError(res, error.message, error.statusCode, {
        code: error.code,
        ...(error.details ? { errors: error.details } : {}),
      });
    }
    if (error.code === "P2002") {
      return sendError(res, "A conflicting questionnaire record already exists.", 409, {
        code: "QUESTIONNAIRE_CONFLICT",
      });
    }
    return next(error);
  }
};

const listPendingSubmissions = run(
  (req) => knbtsQuestionnaireService.getPendingQueue(req.user.userId, req.query),
  "Pending questionnaire submissions retrieved."
);

const getSubmission = run(
  (req) => knbtsQuestionnaireService.getSubmissionForReview(req.user.userId, req.params.submissionId),
  "Questionnaire submission retrieved."
);

const recordReview = run(
  (req) => knbtsQuestionnaireService.recordReviewDecision(
    req.user.userId,
    req.params.submissionId,
    req.body
  ),
  "Questionnaire review decision recorded."
);

const recordAssessment = run(
  (req) => knbtsQuestionnaireService.recordClinicalAssessment(
    req.user.userId,
    req.params.submissionId,
    req.body
  ),
  "Clinical assessment recorded."
);

const issueApproval = run(
  (req) => knbtsQuestionnaireService.issueApproval(req.user.userId, req.params.submissionId),
  "Questionnaire approval issued.",
  201
);

const listApprovals = run(
  (req) => knbtsQuestionnaireService.listApprovals(req.user.userId, req.query),
  "Questionnaire approvals retrieved."
);

const getApproval = run(
  (req) => knbtsQuestionnaireService.getApproval(req.user.userId, req.params.approvalId),
  "Questionnaire approval retrieved."
);

module.exports = {
  listPendingSubmissions,
  getSubmission,
  recordReview,
  recordAssessment,
  issueApproval,
  listApprovals,
  getApproval,
};

