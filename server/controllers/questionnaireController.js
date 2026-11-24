const { sendError, sendSuccess } = require("../utils/response");
const questionnaireService = require("../services/questionnaireService");

const run = (operation, successMessage, statusCode = 200) => async (req, res, next) => {
  try {
    const result = await operation(req);
    return sendSuccess(res, result, successMessage, statusCode);
  } catch (error) {
    if (error instanceof questionnaireService.QuestionnaireError) {
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

const getPublishedQuestionnaire = run(
  (req) => questionnaireService.getCurrentQuestionnaire(req.user.userId),
  "Published questionnaire retrieved."
);

const createDraftSubmission = run((req) => {
  const bodyKeys = Object.keys(req.body || {});
  if (bodyKeys.length) {
    throw new questionnaireService.QuestionnaireError(
      "Submission ownership and questionnaire version are selected by the server.",
      400,
      "UNSUPPORTED_SUBMISSION_FIELDS"
    );
  }
  return questionnaireService.createDraftSubmission(req.user.userId);
}, "Questionnaire draft created.", 201);

const listOwnSubmissions = run(
  (req) => questionnaireService.listOwnSubmissions(req.user.userId),
  "Questionnaire submissions retrieved."
);

const getOwnSubmission = run(
  (req) => questionnaireService.getOwnSubmission(req.user.userId, req.params.submissionId),
  "Questionnaire submission retrieved."
);

const saveDraftAnswers = run((req) =>
  questionnaireService.saveDraftAnswers(req.user.userId, req.params.submissionId, req.body.answers),
"Draft answers saved.");

const deleteDraftAnswer = run((req) =>
  questionnaireService.deleteDraftAnswer(req.user.userId, req.params.submissionId, req.params.questionId),
"Draft answer removed.");

const finalizeSubmission = run((req) =>
  questionnaireService.finalizeSubmission(
    req.user.userId,
    req.params.submissionId,
    req.body.declarationAcknowledged
  ),
"Questionnaire submitted for review.");

module.exports = {
  getPublishedQuestionnaire,
  createDraftSubmission,
  listOwnSubmissions,
  getOwnSubmission,
  saveDraftAnswers,
  deleteDraftAnswer,
  finalizeSubmission,
};
