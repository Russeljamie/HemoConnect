const prisma = require("./prisma");
const { notifyUser } = require("./notificationDelivery");
const { parseNairobiDateOnly } = require("../utils/nairobiDate");

class QuestionnaireError extends Error {
  constructor(message, statusCode = 400, code = "QUESTIONNAIRE_INVALID", details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const answerValueFields = [
  "textValue",
  "dateValue",
  "numberValue",
  "booleanValue",
  "optionId",
  "travelPeriodValue",
  "travelPeriodUnit",
];

const getDatabaseNow = async (tx) => {
  const rows = await tx.$queryRaw`SELECT CURRENT_TIMESTAMP AS "now"`;
  return rows[0]?.now instanceof Date ? rows[0].now : new Date(rows[0]?.now);
};

const getDonor = async (client, userId) => client.donor.findUnique({
  where: { userId },
  include: {
    user: { select: { email: true, phone: true } },
  },
});

const toQuestionnaireQuestion = (question) => ({
  questionnaireQuestionId: question.questionnaireQuestionId,
  questionKey: question.questionKey,
  numberLabel: question.numberLabel,
  subsectionLabel: question.subsectionLabel,
  prompt: question.prompt,
  answerType: question.answerType,
  parentQuestionId: question.parentQuestionId,
  parentQuestion: question.parentQuestion
    ? {
        questionnaireQuestionId: question.parentQuestion.questionnaireQuestionId,
        questionKey: question.parentQuestion.questionKey,
        numberLabel: question.parentQuestion.numberLabel,
      }
    : null,
  displayOrder: question.displayOrder,
  required: question.required,
  isDerived: question.isDerived,
  options: question.options.map((option) => ({
    optionId: option.optionId,
    optionKey: option.optionKey,
    optionLabel: option.optionLabel,
    displayOrder: option.displayOrder,
  })),
});

const toPublicSubmission = (submission) => ({
  ...submission,
  answers: submission.answers.map(({ answerOption, ...answer }) => ({
    ...answer,
    answerOption: answerOption
      ? {
          optionId: answerOption.optionId,
          optionKey: answerOption.optionKey,
          optionLabel: answerOption.optionLabel,
        }
      : null,
  })),
});

const loadPublishedVersion = async (client, now = new Date()) => {
  const version = await client.questionnaireVersion.findFirst({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      ],
    },
    orderBy: [{ versionNumber: "desc" }, { publishedAt: "desc" }],
    include: {
      questions: {
        orderBy: [{ displayOrder: "asc" }, { questionnaireQuestionId: "asc" }],
        include: {
          parentQuestion: {
            select: {
              questionnaireQuestionId: true,
              questionKey: true,
              numberLabel: true,
              answerType: true,
              isDerived: true,
            },
          },
          options: {
            where: { isActive: true },
            orderBy: [{ displayOrder: "asc" }, { optionId: "asc" }],
            select: {
              optionId: true,
              optionKey: true,
              optionLabel: true,
              displayOrder: true,
            },
          },
        },
      },
    },
  });

  return version;
};

const getCurrentQuestionnaire = async (userId) => {
  const donor = await getDonor(prisma, userId);
  if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
  const now = await getDatabaseNow(prisma);
  const version = await loadPublishedVersion(prisma, now);
  if (!version) {
    throw new QuestionnaireError(
      "No published donor questionnaire is currently available.",
      404,
      "NO_PUBLISHED_QUESTIONNAIRE"
    );
  }

  return {
    questionnaire: {
      questionnaireVersionId: version.questionnaireVersionId,
      versionNumber: version.versionNumber,
      title: version.title,
      publishedAt: version.publishedAt,
      questions: version.questions.map(toQuestionnaireQuestion),
    },
    donorInformation: snapshotDonorInformation(donor),
  };
};

const snapshotDonorInformation = (donor) => ({
  familyName: donor.lastName,
  donorNumber: String(donor.donorId),
  firstName: donor.firstName,
  email: donor.user?.email || null,
  gender: donor.gender,
  mobile: donor.user?.phone || null,
  dateOfBirth: donor.birthDate ? donor.birthDate.toISOString().slice(0, 10) : null,
  occupation: null,
});

const createDraftSubmission = async (userId) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const donorRows = await tx.$queryRaw`
        SELECT "donorId"
        FROM "Donor"
        WHERE "userId" = ${userId}
        FOR UPDATE
      `;
      if (!donorRows[0]) {
        throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
      }

      const donor = await getDonor(tx, userId);
      if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
      const now = await getDatabaseNow(tx);

      const activeBooking = await tx.questionnaireApproval.findFirst({
        where: {
          donorId: donor.donorId,
          bookingAssociations: {
            some: {
              status: "ACTIVE",
              appointment: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
            },
          },
        },
        select: { approvalId: true },
      });
      if (activeBooking) {
        throw new QuestionnaireError(
          "An unresolved appointment is already associated with your valid questionnaire approval.",
          409,
          "ACTIVE_APPROVAL_BOOKING_EXISTS"
        );
      }

      const pendingSubmission = await tx.donorQuestionnaireSubmission.findFirst({
        where: { donorId: donor.donorId, status: "PENDING" },
        select: { submissionId: true },
      });
      if (pendingSubmission) {
        throw new QuestionnaireError(
          "A questionnaire submission is already awaiting review.",
          409,
          "PENDING_SUBMISSION_EXISTS"
        );
      }

      const version = await loadPublishedVersion(tx, now);
      if (!version) {
        throw new QuestionnaireError(
          "No published donor questionnaire is currently available.",
          404,
          "NO_PUBLISHED_QUESTIONNAIRE"
        );
      }

      const submission = await tx.donorQuestionnaireSubmission.create({
        data: {
          donorId: donor.donorId,
          versionId: version.questionnaireVersionId,
          status: "DRAFT",
        },
        select: {
          submissionId: true,
          status: true,
          versionId: true,
          createdAt: true,
          donorInformationSnapshot: true,
        },
      });
      return { submission };
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new QuestionnaireError(
        "A pending questionnaire submission already exists.",
        409,
        "PENDING_SUBMISSION_EXISTS"
      );
    }
    throw error;
  }
};

const parsePositiveId = (value, label) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new QuestionnaireError(`Invalid ${label}.`, 400, "INVALID_ID");
  }
  return id;
};

const getOwnedSubmission = async (client, submissionId, donorId) => {
  const submission = await client.donorQuestionnaireSubmission.findFirst({
    where: { submissionId, donorId },
    include: {
      version: { select: { questionnaireVersionId: true, versionNumber: true, title: true } },
      answers: {
        orderBy: [{ questionId: "asc" }],
        include: {
          question: {
            select: {
              questionnaireQuestionId: true,
              questionKey: true,
              numberLabel: true,
              subsectionLabel: true,
              prompt: true,
              answerType: true,
              isDerived: true,
            },
          },
          answerOption: { select: { optionId: true, optionKey: true, optionLabel: true, isActive: true } },
        },
      },
    },
  });
  if (!submission) {
    throw new QuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
  }
  return submission;
};

const listOwnSubmissions = async (userId) => {
  const donor = await prisma.donor.findUnique({ where: { userId }, select: { donorId: true } });
  if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
  const submissions = await prisma.donorQuestionnaireSubmission.findMany({
    where: { donorId: donor.donorId },
    orderBy: [{ createdAt: "desc" }, { submissionId: "desc" }],
    select: {
      submissionId: true,
      versionId: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      version: { select: { versionNumber: true, title: true } },
    },
  });
  return { submissions };
};

const getOwnSubmission = async (userId, submissionIdValue) => {
  const submissionId = parsePositiveId(submissionIdValue, "submission ID");
  const donor = await prisma.donor.findUnique({ where: { userId }, select: { donorId: true } });
  if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
  return { submission: toPublicSubmission(await getOwnedSubmission(prisma, submissionId, donor.donorId)) };
};

const getAnswerPayloadFields = (answer) => {
  const allowed = new Set(["questionId", ...answerValueFields]);
  const unknown = Object.keys(answer).filter((key) => !allowed.has(key));
  if (unknown.length) throw new QuestionnaireError("Answer contains unsupported fields.", 400, "INVALID_ANSWER_FIELDS");
  return answer;
};

const normalizeAnswer = async (tx, question, input) => {
  getAnswerPayloadFields(input);
  if (question.isDerived || question.answerType === "DERIVED_YES_NO") {
    throw new QuestionnaireError("Derived answers are calculated by the server.", 400, "DERIVED_ANSWER_READ_ONLY");
  }

  const normalized = {
    submissionId: undefined,
    versionId: question.versionId,
    questionId: question.questionnaireQuestionId,
    answerOptionId: null,
    textValue: null,
    dateValue: null,
    numberValue: null,
    booleanValue: null,
    travelPeriodValue: null,
    travelPeriodUnit: null,
    answeredAt: await getDatabaseNow(tx),
  };
  const providedValues = answerValueFields.filter((field) => input[field] !== undefined && input[field] !== null);
  const hasTravel = input.travelPeriodValue !== undefined || input.travelPeriodUnit !== undefined;
  const ordinaryValues = providedValues.filter((field) => field !== "travelPeriodValue" && field !== "travelPeriodUnit");

  if (question.numberLabel !== "1.9" && hasTravel) {
    throw new QuestionnaireError("Travel period is only valid for question 1.9.", 400, "INVALID_TRAVEL_PERIOD");
  }

  switch (question.answerType) {
    case "YES_NO":
      if (ordinaryValues.some((field) => field !== "booleanValue")) {
        throw new QuestionnaireError("Yes/No questions require a boolean answer.", 400, "ANSWER_TYPE_MISMATCH");
      }
      if (input.booleanValue !== undefined && typeof input.booleanValue !== "boolean") {
        throw new QuestionnaireError("Yes/No questions require a boolean answer.", 400, "ANSWER_TYPE_MISMATCH");
      }
      normalized.booleanValue = input.booleanValue ?? null;
      break;
    case "TEXT":
      if (ordinaryValues.some((field) => field !== "textValue") || (input.textValue !== undefined && typeof input.textValue !== "string")) {
        throw new QuestionnaireError("Text questions require a text answer.", 400, "ANSWER_TYPE_MISMATCH");
      }
      if ((input.textValue || "").length > 5000) throw new QuestionnaireError("Text answer is too long.", 400, "ANSWER_TOO_LONG");
      normalized.textValue = input.textValue ?? null;
      break;
    case "DATE": {
      if (ordinaryValues.some((field) => field !== "dateValue")) {
        throw new QuestionnaireError("Date questions require a date-only answer.", 400, "ANSWER_TYPE_MISMATCH");
      }
      if (input.dateValue !== undefined) {
        const dateValue = parseNairobiDateOnly(input.dateValue);
        if (!dateValue) throw new QuestionnaireError("Date answer must use a valid YYYY-MM-DD date.", 400, "INVALID_DATE_ANSWER");
        normalized.dateValue = dateValue;
      }
      break;
    }
    case "NUMBER":
      if (ordinaryValues.some((field) => field !== "numberValue") || (input.numberValue !== undefined && (typeof input.numberValue !== "number" || !Number.isFinite(input.numberValue)))) {
        throw new QuestionnaireError("Number questions require a finite numeric answer.", 400, "ANSWER_TYPE_MISMATCH");
      }
      normalized.numberValue = input.numberValue ?? null;
      break;
    case "OPTION": {
      if (ordinaryValues.some((field) => field !== "optionId")) {
        throw new QuestionnaireError("Option questions require a valid option.", 400, "ANSWER_TYPE_MISMATCH");
      }
      if (input.optionId !== undefined) {
        const optionId = Number(input.optionId);
        if (!Number.isSafeInteger(optionId) || optionId < 1) throw new QuestionnaireError("Invalid option.", 400, "INVALID_OPTION");
        const option = await tx.questionnaireOption.findFirst({
          where: { optionId, questionId: question.questionnaireQuestionId, isActive: true },
          select: { optionId: true },
        });
        if (!option) throw new QuestionnaireError("Option does not belong to this question or is inactive.", 400, "INVALID_OPTION");
        normalized.answerOptionId = option.optionId;
      }
      break;
    }
    case "DECLARATION_ACKNOWLEDGEMENT":
      if (ordinaryValues.some((field) => field !== "booleanValue") || (input.booleanValue !== undefined && typeof input.booleanValue !== "boolean")) {
        throw new QuestionnaireError("Declaration acknowledgements require a boolean answer.", 400, "ANSWER_TYPE_MISMATCH");
      }
      normalized.booleanValue = input.booleanValue ?? null;
      break;
    default:
      throw new QuestionnaireError("Unsupported answer type.", 400, "UNSUPPORTED_ANSWER_TYPE");
  }

  if (question.numberLabel === "1.9") {
    if (normalized.booleanValue === false && hasTravel) {
      throw new QuestionnaireError("Travel period must be omitted when the answer is No.", 400, "INVALID_TRAVEL_PERIOD");
    }
    if (input.travelPeriodValue !== undefined && input.travelPeriodValue !== null) {
      if (!Number.isSafeInteger(input.travelPeriodValue) || input.travelPeriodValue < 1) {
        throw new QuestionnaireError("Travel period must be a positive whole number.", 400, "INVALID_TRAVEL_PERIOD");
      }
      normalized.travelPeriodValue = input.travelPeriodValue;
    }
    if (input.travelPeriodUnit !== undefined && input.travelPeriodUnit !== null) {
      if (!["MONTHS", "YEARS"].includes(input.travelPeriodUnit)) {
        throw new QuestionnaireError("Travel period unit must be MONTHS or YEARS.", 400, "INVALID_TRAVEL_PERIOD");
      }
      normalized.travelPeriodUnit = input.travelPeriodUnit;
    }
  }

  return normalized;
};

const isAffirmative = (answer) => {
  if (!answer) return false;
  if (typeof answer.booleanValue === "boolean") return answer.booleanValue;
  const label = answer.answerOption?.optionKey || answer.answerOption?.optionLabel;
  return typeof label === "string" && ["yes", "true", "y"].includes(label.trim().toLowerCase());
};

const isApplicable = (question, questionMap, answerMap) => {
  if (!question.parentQuestionId) return true;
  const parent = questionMap.get(question.parentQuestionId);
  if (!parent || parent.isDerived || parent.answerType === "DERIVED_YES_NO") return true;
  return isAffirmative(answerMap.get(parent.questionnaireQuestionId));
};

const validateStoredAnswer = (question, answer) => {
  if (!answer) return false;
  switch (question.answerType) {
    case "YES_NO":
    case "DECLARATION_ACKNOWLEDGEMENT":
      return typeof answer.booleanValue === "boolean";
    case "TEXT":
      return typeof answer.textValue === "string" && answer.textValue.trim().length > 0;
    case "DATE":
      return answer.dateValue instanceof Date && !Number.isNaN(answer.dateValue.getTime());
    case "NUMBER":
      return typeof answer.numberValue === "number" && Number.isFinite(answer.numberValue);
    case "OPTION":
      return Boolean(answer.answerOptionId && answer.answerOption?.isActive === true);
    case "DERIVED_YES_NO":
      return typeof answer.booleanValue === "boolean";
    default:
      return false;
  }
};

const deleteDraftAnswer = async (userId, submissionIdValue, questionIdValue) => {
  const submissionId = parsePositiveId(submissionIdValue, "submission ID");
  const questionId = parsePositiveId(questionIdValue, "question ID");
  const donor = await prisma.donor.findUnique({ where: { userId }, select: { donorId: true } });
  if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`
      SELECT "submissionId" FROM "DonorQuestionnaireSubmission"
      WHERE "submissionId" = ${submissionId} AND "donorId" = ${donor.donorId}
      FOR UPDATE
    `;
    if (!locked.length) throw new QuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
    const submission = await getOwnedSubmission(tx, submissionId, donor.donorId);
    if (submission.status !== "DRAFT") throw new QuestionnaireError("Submitted questionnaire answers cannot be changed.", 409, "SUBMISSION_LOCKED");
    const deleted = await tx.questionnaireAnswer.deleteMany({ where: { submissionId, questionId } });
    if (!deleted.count) throw new QuestionnaireError("Answer not found.", 404, "ANSWER_NOT_FOUND");
    return { deleted: true };
  });
};

const saveDraftAnswers = async (userId, submissionIdValue, answers) => {
  const submissionId = parsePositiveId(submissionIdValue, "submission ID");
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > 200) {
    throw new QuestionnaireError("Provide between 1 and 200 answers.", 400, "INVALID_ANSWERS");
  }
  const questionIds = answers.map((answer) => Number(answer?.questionId));
  if (questionIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(questionIds).size !== questionIds.length) {
    throw new QuestionnaireError("Answers must contain unique valid question IDs.", 400, "DUPLICATE_OR_INVALID_QUESTION");
  }
  const donor = await prisma.donor.findUnique({ where: { userId }, select: { donorId: true } });
  if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT "submissionId" FROM "DonorQuestionnaireSubmission"
        WHERE "submissionId" = ${submissionId} AND "donorId" = ${donor.donorId}
        FOR UPDATE
      `;
      if (!locked.length) throw new QuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
      const submission = await getOwnedSubmission(tx, submissionId, donor.donorId);
      if (submission.status !== "DRAFT") throw new QuestionnaireError("Submitted questionnaire answers cannot be changed.", 409, "SUBMISSION_LOCKED");

      const questions = await tx.questionnaireQuestion.findMany({
        where: { versionId: submission.versionId, questionnaireQuestionId: { in: questionIds } },
        include: {
          parentQuestion: { select: { questionnaireQuestionId: true, questionKey: true, answerType: true, isDerived: true } },
          options: { where: { isActive: true }, select: { optionId: true, optionKey: true, optionLabel: true } },
        },
      });
      if (questions.length !== questionIds.length) throw new QuestionnaireError("One or more questions do not belong to this questionnaire version.", 400, "QUESTION_VERSION_MISMATCH");
      const questionMap = new Map(questions.map(question => [question.questionnaireQuestionId, question]));
      const normalizedAnswers = [];
      for (const input of answers) {
        const question = questionMap.get(Number(input.questionId));
        if (question.isDerived || question.answerType === "DERIVED_YES_NO") throw new QuestionnaireError("Derived answers are calculated by the server.", 400, "DERIVED_ANSWER_READ_ONLY");
        normalizedAnswers.push(await normalizeAnswer(tx, question, input));
      }

      const answerMap = new Map(submission.answers.map(answer => [answer.questionId, answer]));
      for (let index = 0; index < answers.length; index += 1) {
        const questionId = questionIds[index];
        const normalized = normalizedAnswers[index];
        const question = questionMap.get(questionId);
        if (question.parentQuestionId) {
          const parent = await tx.questionnaireQuestion.findUnique({
            where: { questionnaireQuestionId: question.parentQuestionId },
            include: { options: true },
          });
          const previousParentAnswer = answerMap.get(parent.questionnaireQuestionId);
          const incomingParentIndex = questionIds.indexOf(parent.questionnaireQuestionId);
          const incomingParent = incomingParentIndex >= 0
            ? { ...normalizedAnswers[incomingParentIndex], answerOption: parent.options.find(option => option.optionId === normalizedAnswers[incomingParentIndex].answerOptionId) }
            : previousParentAnswer;
          if (parent && !parent.isDerived && !isAffirmative(incomingParent)) {
            throw new QuestionnaireError("This conditional question is available only when its parent answer is Yes.", 400, "CONDITIONAL_QUESTION_NOT_APPLICABLE");
          }
        }
        answerMap.set(questionId, {
          ...normalized,
          answerOption: question.options.find(option => option.optionId === normalized.answerOptionId),
        });
      }

      for (const answer of normalizedAnswers) {
        await tx.questionnaireAnswer.upsert({
          where: { submissionId_questionId: { submissionId, questionId: answer.questionId } },
          create: { ...answer, submissionId },
          update: {
            versionId: answer.versionId,
            answerOptionId: answer.answerOptionId,
            textValue: answer.textValue,
            dateValue: answer.dateValue,
            numberValue: answer.numberValue,
            booleanValue: answer.booleanValue,
            travelPeriodValue: answer.travelPeriodValue,
            travelPeriodUnit: answer.travelPeriodUnit,
            answeredAt: answer.answeredAt,
          },
        });
      }

      return { submission: toPublicSubmission(await getOwnedSubmission(tx, submissionId, donor.donorId)) };
    });
  } catch (error) {
    if (error.code === "P2002") throw new QuestionnaireError("Duplicate answer for this question.", 409, "DUPLICATE_ANSWER");
    throw error;
  }
};

const finalizeSubmission = async (userId, submissionIdValue, declarationAcknowledged) => {
  const submissionId = parsePositiveId(submissionIdValue, "submission ID");
  if (declarationAcknowledged !== true) {
    throw new QuestionnaireError("Confirm the declaration before submitting.", 400, "DECLARATION_REQUIRED");
  }
  const donor = await prisma.donor.findUnique({ where: { userId }, select: { donorId: true } });
  if (!donor) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT "submissionId" FROM "DonorQuestionnaireSubmission"
        WHERE "submissionId" = ${submissionId} AND "donorId" = ${donor.donorId}
        FOR UPDATE
      `;
      if (!locked.length) throw new QuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
      const donorRows = await tx.$queryRaw`
        SELECT d."donorId"
        FROM "Donor" d
        JOIN "User" u ON u."userId" = d."userId"
        WHERE d."donorId" = ${donor.donorId}
        FOR SHARE OF d, u
      `;
      if (!donorRows.length) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
      const donorAtSubmission = await getDonor(tx, userId);
      if (!donorAtSubmission) throw new QuestionnaireError("Donor profile not found.", 404, "DONOR_NOT_FOUND");
      const submission = await getOwnedSubmission(tx, submissionId, donor.donorId);
      if (submission.status !== "DRAFT") throw new QuestionnaireError("Questionnaire submission is no longer editable.", 409, "SUBMISSION_LOCKED");

      const questions = await tx.questionnaireQuestion.findMany({
        where: { versionId: submission.versionId},
        orderBy: [{ displayOrder: "asc" }, { questionnaireQuestionId: "asc" }],
        include: {
          options: { where: { isActive: true }, select: { optionId: true, optionKey: true, optionLabel: true } },
        },
      });
      if (!questions.length) throw new QuestionnaireError("This questionnaire version has no questions.", 409, "EMPTY_QUESTIONNAIRE");
      const questionMap = new Map(questions.map(question => [question.questionnaireQuestionId, question]));
      const answerMap = new Map(submission.answers.map(answer => [answer.questionId, {
        ...answer,
        answerOption: answer.answerOption,
      }]));

      for (const question of questions.filter(q => q.answerType === "DERIVED_YES_NO")) {
        const children = questions.filter(child => child.parentQuestionId === question.questionnaireQuestionId);
        const derivedValue = children.some(child => isAffirmative(answerMap.get(child.questionnaireQuestionId)));
        const derived = {
          submissionId,
          versionId: submission.versionId,
          questionId: question.questionnaireQuestionId,
          answerOptionId: null,
          textValue: null,
          dateValue: null,
          numberValue: null,
          booleanValue: derivedValue,
          travelPeriodValue: null,
          travelPeriodUnit: null,
          answeredAt: await getDatabaseNow(tx),
        };
        await tx.questionnaireAnswer.upsert({
          where: { submissionId_questionId: { submissionId, questionId: question.questionnaireQuestionId } },
          create: derived,
          update: {
            versionId: derived.versionId,
            answerOptionId: null,
            textValue: null,
            dateValue: null,
            numberValue: null,
            booleanValue: derivedValue,
            travelPeriodValue: null,
            travelPeriodUnit: null,
            answeredAt: derived.answeredAt,
          },
        });
        answerMap.set(question.questionnaireQuestionId, derived);
      }

      const errors = [];
      for (const question of questions) {
        const answer = answerMap.get(question.questionnaireQuestionId);
        const applicable = isApplicable(question, questionMap, answerMap);
        if (!applicable) {
          if (answer) errors.push({ questionId: question.questionnaireQuestionId, message: "Remove answers to questions whose parent answer is No." });
          continue;
        }
        if (question.isDerived || question.answerType === "DERIVED_YES_NO") continue;
        if (question.required && !validateStoredAnswer(question, answer)) {
          errors.push({ questionId: question.questionnaireQuestionId, message: "A valid answer is required." });
          continue;
        }
        if (answer && !validateStoredAnswer(question, answer)) {
          errors.push({ questionId: question.questionnaireQuestionId, message: "Answer does not match the question type." });
        }
        if (question.answerType === "DECLARATION_ACKNOWLEDGEMENT" && question.required && answer?.booleanValue !== true) {
          errors.push({ questionId: question.questionnaireQuestionId, message: "All required declaration statements must be acknowledged." });
        }
        if (question.numberLabel === "1.9" && answer?.booleanValue === true && (!Number.isInteger(answer.travelPeriodValue) || answer.travelPeriodValue < 1 || !["MONTHS", "YEARS"].includes(answer.travelPeriodUnit))) {
          errors.push({ questionId: question.questionnaireQuestionId, message: "Provide a valid travel period and unit." });
        }
        if (question.numberLabel === "1.9" && answer?.booleanValue === false && (answer.travelPeriodValue !== null || answer.travelPeriodUnit !== null)) {
          errors.push({ questionId: question.questionnaireQuestionId, message: "Travel period must be omitted when the answer is No." });
        }
      }
      if (errors.length) throw new QuestionnaireError("Questionnaire is incomplete or contains invalid answers.", 400, "SUBMISSION_VALIDATION_FAILED", errors);

      const now = await getDatabaseNow(tx);
      const updated = await tx.donorQuestionnaireSubmission.updateMany({
        where: { submissionId, donorId: donor.donorId, status: "DRAFT" },
        data: {
          status: "PENDING",
          submittedAt: now,
          declarationAcknowledgedAt: now,
          donorInformationSnapshot: snapshotDonorInformation(donorAtSubmission),
        },
      });
      if (!updated.count) throw new QuestionnaireError("Questionnaire submission is no longer editable.", 409, "SUBMISSION_LOCKED");
      await tx.auditLog.create({
        data: {
          action: "DONOR_QUESTIONNAIRE_SUBMITTED",
          entityType: "DonorQuestionnaireSubmission",
          entityId: String(submissionId),
          actorUserId: userId,
          details: { donorId: donor.donorId, versionId: submission.versionId },
        },
      });
      await notifyUser(tx, {
        userId,
        email: donorAtSubmission.user?.email,
        phone: donorAtSubmission.user?.phone,
        eventKey: `questionnaire-${submissionId}-submitted`,
        type: "QUESTIONNAIRE_SUBMITTED",
        title: "Questionnaire submitted",
        message: "Your donor questionnaire was submitted and is awaiting KNBTS review.",
        emailTemplate: "QUESTIONNAIRE_SUBMITTED",
        emailPayload: {
          name: `${donorAtSubmission.firstName} ${donorAtSubmission.lastName}`,
        },
      });
      return { submission: toPublicSubmission(await getOwnedSubmission(tx, submissionId, donor.donorId)) };
    });
  } catch (error) {
    if (error.code === "P2002") throw new QuestionnaireError("A pending submission already exists or this questionnaire was already submitted.", 409, "PENDING_SUBMISSION_EXISTS");
    throw error;
  }
};

module.exports = {
  QuestionnaireError,
  getCurrentQuestionnaire,
  createDraftSubmission,
  listOwnSubmissions,
  getOwnSubmission,
  saveDraftAnswers,
  deleteDraftAnswer,
  finalizeSubmission,
};
