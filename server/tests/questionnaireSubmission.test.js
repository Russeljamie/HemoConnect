const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");
const { createTestArtifactTracker } = require("./helpers/testArtifactTracker");

describe("donor questionnaire submission and answer APIs", () => {
  let donorUser;
  let donor;
  let donorToken;
  let adminToken;
  let version;
  let questionIds;
  let optionIds;
  let submissionIds;
  let extraVersionId;
  let extraQuestionId;
  let otherSubmissionId;
  const artifactTracker = createTestArtifactTracker(prisma);

  const questionDefinitions = [
    { key: "health_1_1", number: "1.1", prompt: "Are you feeling well and in good health today?", type: "YES_NO" },
    { key: "health_1_2", number: "1.2", prompt: "In the last 4 hours, have you had a meal or snack?", type: "YES_NO" },
    { key: "health_1_3", number: "1.3", prompt: "Have you already given blood in the last 90 days?", type: "YES_NO" },
    { key: "health_1_4", number: "1.4", prompt: "Are you pregnant or breastfeeding?", type: "YES_NO" },
    { key: "health_1_5", number: "1.5", prompt: "Do you have or have you ever had:", type: "DERIVED_YES_NO", derived: true, required: false },
    { key: "health_1_5a", number: "1.5", subsection: "a", prompt: "Chest pains, heart disease/surgery or a stroke?", type: "YES_NO", parent: "health_1_5" },
    { key: "health_1_5b", number: "1.5", subsection: "b", prompt: "Lung disease, tuberculosis or asthma?", type: "YES_NO", parent: "health_1_5" },
    { key: "health_1_5c", number: "1.5", subsection: "c", prompt: "Cancer, a blood disease, an abnormal bleeding disorder?", type: "YES_NO", parent: "health_1_5" },
    { key: "health_1_6", number: "1.6", prompt: "In the last 7 days, have you seen a doctor, dentist or any other healthcare professional or are you waiting to see one (except for routine screening appointments)?", type: "YES_NO" },
    { key: "health_1_7", number: "1.7", prompt: "In the past 12 months:", type: "DERIVED_YES_NO", derived: true, required: false },
    { key: "health_1_7a", number: "1.7", subsection: "a", prompt: "Have you been ill, received any treatment or taken any medication?", type: "YES_NO", parent: "health_1_7" },
    { key: "health_1_7b", number: "1.7", subsection: "b", prompt: "Have you been under a doctor's care, undergone surgery, or a diagnostic procedure, suffered a major illness, or been involved in a serious accident?", type: "YES_NO", parent: "health_1_7" },
    { key: "health_1_7c", number: "1.7", subsection: "c", prompt: "In the past 12 months, have you been tattooed, had ear or body piercing, acupuncture, circumcision or scarification, cosmetic treatment?", type: "YES_NO", parent: "health_1_7" },
    { key: "health_1_8", number: "1.8", prompt: "In the past 12 months, have you or your sexual partner received a blood transfusion?", type: "YES_NO" },
    { key: "health_1_9", number: "1.9", prompt: "When did you last travel to another region or country (in months / years)?", type: "YES_NO" },
    { key: "risk_2_1", number: "2.1", prompt: "Is your reason for donating blood to undergo an HIV test?", type: "YES_NO" },
    { key: "risk_2_2", number: "2.2", prompt: "Have you ever been tested for HIV?", type: "YES_NO" },
    { key: "risk_2_3", number: "2.3", prompt: "Have you suffered from a sexually transmitted disease (STD): e.g. syphilis, gonorrhoea, genital herpes?", type: "YES_NO" },
    { key: "risk_2_4", number: "2.4", prompt: "In the past 12 months:", type: "DERIVED_YES_NO", derived: true, required: false },
    { key: "risk_2_4a", number: "2.4", subsection: "a", prompt: "Has there been any change in your marital status?", type: "YES_NO", parent: "risk_2_4" },
    { key: "risk_2_4c", number: "2.4", subsection: "c", prompt: "Have you been a victim of sexual abuse?", type: "YES_NO", parent: "risk_2_4" },
    { key: "risk_2_5", number: "2.5", prompt: "Have you or your sexual partner suffered from night sweats, unintentional weight loss, diarrhea or swollen glands?", type: "YES_NO" },
    { key: "risk_2_6", number: "2.6", prompt: "Have you been in contact with anyone with an infectious disease or in the last 12 months have you had any immunizations, vaccinations or jabs?", type: "YES_NO" },
    { key: "risk_2_7", number: "2.7", prompt: "Have you ever been refused as a blood donor, or told not to donate blood?", type: "YES_NO" },
    { key: "declaration_a", number: "3", subsection: "a", prompt: "I confirm that, to the best of my knowledge, I have answered all the questions accurately and I consider my blood safe for transfusion to a patient.", type: "DECLARATION_ACKNOWLEDGEMENT" },
    { key: "declaration_b", number: "3", subsection: "b", prompt: "I understand that any wilful misrepresentation of facts could endanger my health or that of patients receiving my blood and may lead to litigation. I am aware that my blood will be screened for, among others, HIV, hepatitis B, hepatitis C and syphilis. I understand that these screening tests are not diagnostic and may yield false-positive results. If any of the tests give a reactive result, I will be contacted using the information I have provided, and offered counselling.", type: "DECLARATION_ACKNOWLEDGEMENT" },
    { key: "declaration_c", number: "3", subsection: "c", prompt: "I understand the blood donation process, and I have been counseled regarding the importance of safe blood donation.", type: "DECLARATION_ACKNOWLEDGEMENT" },
    { key: "declaration_d", number: "3", subsection: "d", prompt: "I confirm that I am over the age of 18 years.", type: "DECLARATION_ACKNOWLEDGEMENT" },
    { key: "declaration_e", number: "3", subsection: "e", prompt: "I undertake that should there be any reason for my blood to be deemed unsafe for use at any stage, I will inform the Blood Transfusion Service.", type: "DECLARATION_ACKNOWLEDGEMENT" },
    { key: "test_option_a", number: "TEST-A", prompt: "Test-only option answer fixture.", type: "OPTION", required: false },
    { key: "test_option_b", number: "TEST-B", prompt: "Test-only second option answer fixture.", type: "OPTION", required: false },
    { key: "test_parent", number: "TEST-PARENT", prompt: "Test-only conditional parent.", type: "YES_NO", required: false },
    { key: "test_child", number: "TEST-CHILD", prompt: "Test-only conditional child.", type: "TEXT", required: false, parent: "test_parent" },
  ];

  const tokenFor = (user) => jwt.sign(
    { userId: user.userId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  const createDraft = async (token = donorToken, body = undefined) => {
    let call = request(app).post("/api/donor/questionnaire/submissions").set("Authorization", `Bearer ${token}`);
    if (body !== undefined) call = call.send(body);
    const response = await call;
    if (response.status === 201) {
      const { submissionId } = response.body.data.submission;
      submissionIds.push(submissionId);
      artifactTracker.trackAudit({
        entityType: "DonorQuestionnaireSubmission",
        entityId: String(submissionId),
      });
    }
    return response;
  };

  const fullValidAnswers = (overrides = {}) => questionDefinitions
    .filter(question => question.type !== "DERIVED_YES_NO" && !question.key.startsWith("test_"))
    .map(question => {
      if (question.type === "DECLARATION_ACKNOWLEDGEMENT") {
        return { questionId: questionIds[question.key], booleanValue: true };
      }
      if (question.key === "health_1_9") {
        return { questionId: questionIds[question.key], booleanValue: false };
      }
      return { questionId: questionIds[question.key], booleanValue: false };
    })
    .map(answer => ({ ...answer, ...(overrides[answer.questionId] || {}) }));

  const saveAnswers = (submissionId, answers, token = donorToken) => request(app)
    .put(`/api/donor/questionnaire/submissions/${submissionId}/answers`)
    .set("Authorization", `Bearer ${token}`)
    .send({ answers });

  const finalize = (submissionId, declarationAcknowledged = true, token = donorToken) => request(app)
    .post(`/api/donor/questionnaire/submissions/${submissionId}/submit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ declarationAcknowledged });

  beforeAll(async () => {
    const [loadedDonorUser, adminUser] = await Promise.all([
      prisma.user.findUnique({ where: { email: "donor1@hemoconnect.co.ke" }, include: { donor: true } }),
      prisma.user.findUnique({ where: { email: "admin@hemoconnect.co.ke" } }),
    ]);
    donorUser = loadedDonorUser;
    donor = loadedDonorUser.donor;
    donorToken = tokenFor(loadedDonorUser);
    adminToken = tokenFor(adminUser);
    submissionIds = [];
    questionIds = {};
    optionIds = {};

    version = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: Math.floor(Date.now() / 1000),
        title: "Task 4 API test fixture",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    for (const [displayOrder, definition] of questionDefinitions.entries()) {
      const created = await prisma.questionnaireQuestion.create({
        data: {
          versionId: version.questionnaireVersionId,
          questionKey: definition.key,
          numberLabel: definition.number,
          subsectionLabel: definition.subsection || null,
          prompt: definition.prompt,
          answerType: definition.type,
          displayOrder,
          required: definition.required !== false,
          isDerived: definition.derived || false,
          parentQuestionId: definition.parent ? undefined : undefined,
        },
      });
      questionIds[definition.key] = created.questionnaireQuestionId;
    }

    for (const definition of questionDefinitions.filter(question => question.parent)) {
      await prisma.questionnaireQuestion.update({
        where: { questionnaireQuestionId: questionIds[definition.key] },
        data: { parentQuestionId: questionIds[definition.parent] },
      });
    }

    for (const [questionKey, options] of Object.entries({
      test_option_a: [["A", "Option A"], ["B", "Option B"]],
      test_option_b: [["X", "Option X"]],
    })) {
      for (const [displayOrder, [optionKey, optionLabel]] of options.entries()) {
        const option = await prisma.questionnaireOption.create({
          data: {
            questionId: questionIds[questionKey],
            optionKey,
            optionLabel,
            displayOrder,
          },
        });
        optionIds[`${questionKey}_${optionKey}`] = option.optionId;
      }
    }
  });

  beforeEach(async () => {
    await artifactTracker.snapshotExisting();
    artifactTracker.trackNotification({
      userId: donorUser.userId,
      type: "QUESTIONNAIRE_SUBMITTED",
    });
    artifactTracker.trackEmail({
      recipientEmail: donorUser.email,
      template: "QUESTIONNAIRE_SUBMITTED",
    });
  });

  afterEach(async () => {
    await artifactTracker.cleanup();
    if (submissionIds.length) {
      await prisma.questionnaireAnswer.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.questionnaireReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.questionnaireClinicalAssessment.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.questionnaireApproval.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.donorQuestionnaireSubmission.deleteMany({ where: { submissionId: { in: submissionIds } } });
      submissionIds = [];
    }
    if (otherSubmissionId) {
      await prisma.donorQuestionnaireSubmission.deleteMany({ where: { submissionId: otherSubmissionId } });
      otherSubmissionId = undefined;
    }
    if (extraQuestionId) {
      await prisma.questionnaireQuestion.deleteMany({ where: { questionnaireQuestionId: extraQuestionId } });
      extraQuestionId = undefined;
    }
    if (extraVersionId) {
      await prisma.questionnaireVersion.deleteMany({ where: { questionnaireVersionId: extraVersionId } });
      extraVersionId = undefined;
    }
  });

  afterAll(async () => {
    try {
      await artifactTracker.cleanup();
    } finally {
      if (submissionIds.length) {
        await prisma.questionnaireAnswer.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await prisma.questionnaireReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await prisma.questionnaireClinicalAssessment.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await prisma.questionnaireApproval.deleteMany({ where: { submissionId: { in: submissionIds } } });
        await prisma.donorQuestionnaireSubmission.deleteMany({ where: { submissionId: { in: submissionIds } } });
      }
      await prisma.questionnaireOption.deleteMany({ where: { questionId: { in: Object.values(questionIds) } } });
      await prisma.questionnaireQuestion.deleteMany({ where: { versionId: version.questionnaireVersionId } });
      await prisma.questionnaireVersion.delete({ where: { questionnaireVersionId: version.questionnaireVersionId } });
      await prisma.$disconnect();
    }
  });

  it("retrieves only the published questionnaire with wording, order, options, and parent links", async () => {
    const draftVersion = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: version.versionNumber + 100,
        title: "Hidden draft test fixture",
        status: "DRAFT",
      },
    });
    const archivedVersion = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: version.versionNumber + 200,
        title: "Hidden archived test fixture",
        status: "ARCHIVED",
      },
    });
    try {
      const response = await request(app)
        .get("/api/donor/questionnaire/current")
        .set("Authorization", `Bearer ${donorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.questionnaire.versionNumber).toBe(version.versionNumber);
      const questions = response.body.data.questionnaire.questions;
      expect(questions[0]).toEqual(expect.objectContaining({
        questionKey: "health_1_1",
        numberLabel: "1.1",
        prompt: "Are you feeling well and in good health today?",
        displayOrder: 0,
      }));
      expect(questions.find(question => question.questionKey === "health_1_5a").parentQuestion.questionKey).toBe("health_1_5");
      expect(questions.find(question => question.questionKey === "test_option_a").options).toHaveLength(2);
      expect(response.body.data.questionnaire).not.toHaveProperty("createdAt");
      expect(response.body.data.donorInformation).toEqual(expect.objectContaining({
        donorNumber: String(donor.donorId),
        familyName: donor.lastName,
        firstName: donor.firstName,
      }));
    } finally {
      await prisma.questionnaireVersion.deleteMany({
        where: { questionnaireVersionId: { in: [draftVersion.questionnaireVersionId, archivedVersion.questionnaireVersionId] } },
      });
    }
  });

  it("returns a controlled not-found response when no published version is available", async () => {
    const nowSpy = jest.spyOn(prisma, "$queryRaw").mockResolvedValue([{ now: new Date() }]);
    const versionSpy = jest.spyOn(prisma.questionnaireVersion, "findFirst").mockResolvedValue(null);
    try {
      const response = await request(app)
        .get("/api/donor/questionnaire/current")
        .set("Authorization", `Bearer ${donorToken}`);
      expect(response.status).toBe(404);
      expect(response.body.details.code).toBe("NO_PUBLISHED_QUESTIONNAIRE");
    } finally {
      nowSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });

  it("requires authentication and donor role", async () => {
    const unauthenticated = await request(app).get("/api/donor/questionnaire/current");
    const nonDonor = await request(app)
      .get("/api/donor/questionnaire/current")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unauthenticated.status).toBe(401);
    expect(nonDonor.status).toBe(403);
  });

  it("creates a draft for the authenticated donor and rejects body ownership fields", async () => {
    const invalid = await createDraft(donorToken, { donorId: donor.donorId + 999 });
    expect(invalid.status).toBe(400);

    const response = await createDraft();
    expect(response.status).toBe(201);
    expect(response.body.data.submission).toEqual(expect.objectContaining({
      status: "DRAFT",
      versionId: version.questionnaireVersionId,
    }));
    const stored = await prisma.donorQuestionnaireSubmission.findUnique({ where: { submissionId: response.body.data.submission.submissionId } });
    expect(stored.donorId).toBe(donor.donorId);
  });

  it("does not reveal a different donor's submission", async () => {
    const otherDonor = await prisma.donor.findFirst({ where: { donorId: { not: donor.donorId } }, select: { donorId: true } });
    if (!otherDonor) throw new Error("Test database needs a second donor fixture.");
    const submission = await prisma.donorQuestionnaireSubmission.create({
      data: { donorId: otherDonor.donorId, versionId: version.questionnaireVersionId, status: "DRAFT" },
    });
    otherSubmissionId = submission.submissionId;

    const response = await request(app)
      .get(`/api/donor/questionnaire/submissions/${submission.submissionId}`)
      .set("Authorization", `Bearer ${donorToken}`);
    expect(response.status).toBe(404);
  });

  it("saves valid answers and rejects an answer with the wrong configured type", async () => {
    const draft = await createDraft();
    const valid = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_1, booleanValue: true },
    ]);
    expect(valid.status).toBe(200);
    expect(valid.body.data.submission.answers[0].booleanValue).toBe(true);
    expect(valid.body.data.submission.answers[0].answerOption).toBeNull();

    const invalid = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_2, textValue: "yes" },
    ]);
    expect(invalid.status).toBe(400);
  });

  it("accepts a valid option and rejects duplicate questions or unsupported answer fields", async () => {
    const draft = await createDraft();
    const validOption = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.test_option_a, optionId: optionIds.test_option_a_A },
    ]);
    expect(validOption.status).toBe(200);

    const duplicate = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_1, booleanValue: true },
      { questionId: questionIds.health_1_1, booleanValue: false },
    ]);
    expect(duplicate.status).toBe(400);

    const unsupported = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_1, booleanValue: true, donorId: donor.donorId + 1 },
    ]);
    expect(unsupported.status).toBe(400);
  });

  it("rejects questions belonging to another questionnaire version", async () => {
    const draft = await createDraft();
    const otherVersion = await prisma.questionnaireVersion.create({
      data: { versionNumber: version.versionNumber + 100000, title: "Draft mismatch fixture", status: "DRAFT" },
    });
    extraVersionId = otherVersion.questionnaireVersionId;
    const otherQuestion = await prisma.questionnaireQuestion.create({
      data: {
        versionId: extraVersionId,
        questionKey: "foreign-version-question",
        numberLabel: "TEST-VERSION",
        prompt: "Test version mismatch fixture.",
        answerType: "YES_NO",
        displayOrder: 0,
      },
    });
    extraQuestionId = otherQuestion.questionnaireQuestionId;

    const response = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: extraQuestionId, booleanValue: true },
    ]);
    expect(response.status).toBe(400);
    expect(response.body.details.code).toBe("QUESTION_VERSION_MISMATCH");
  });

  it("rejects options belonging to a different question", async () => {
    const draft = await createDraft();
    const response = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.test_option_b, optionId: optionIds.test_option_a_A },
    ]);
    expect(response.status).toBe(400);
    expect(response.body.details.code).toBe("INVALID_OPTION");
  });

  it("validates positive travel period and unit for a Yes answer to 1.9", async () => {
    const draft = await createDraft();
    const invalid = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_9, booleanValue: true, travelPeriodValue: 0, travelPeriodUnit: "MONTHS" },
    ]);
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.code).toBe("INVALID_TRAVEL_PERIOD");

    const valid = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_9, booleanValue: true, travelPeriodValue: 2, travelPeriodUnit: "YEARS" },
    ]);
    expect(valid.status).toBe(200);
  });

  it("rejects donor attempts to set derived parent answers", async () => {
    const draft = await createDraft();
    const response = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_5, booleanValue: false },
    ]);
    expect(response.status).toBe(400);
    expect(response.body.details.code).toBe("DERIVED_ANSWER_READ_ONLY");
  });

  it("requires all required answers and declaration acknowledgements before finalization", async () => {
    const draft = await createDraft();
    const noTopLevelDeclaration = await finalize(draft.body.data.submission.submissionId, false);
    expect(noTopLevelDeclaration.status).toBe(400);

    const response = await finalize(draft.body.data.submission.submissionId, true);
    expect(response.status).toBe(400);
    expect(response.body.details.code).toBe("SUBMISSION_VALIDATION_FAILED");

    const answers = fullValidAnswers();
    answers.find(answer => answer.questionId === questionIds.declaration_e).booleanValue = false;
    await saveAnswers(draft.body.data.submission.submissionId, answers);
    const declarationFail = await finalize(draft.body.data.submission.submissionId, true);
    expect(declarationFail.status).toBe(400);
  });

  it("enforces conditional travel-period data on question 1.9", async () => {
    const draft = await createDraft();
    const answers = fullValidAnswers();
    answers.find(answer => answer.questionId === questionIds.health_1_9).booleanValue = true;
    await saveAnswers(draft.body.data.submission.submissionId, answers);
    const missingPeriod = await finalize(draft.body.data.submission.submissionId, true);
    expect(missingPeriod.status).toBe(400);

    await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_9, booleanValue: true, travelPeriodValue: 3, travelPeriodUnit: "MONTHS" },
    ]);
    const submitted = await finalize(draft.body.data.submission.submissionId, true);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.submission.status).toBe("PENDING");
  });

  it("enforces parent conditions for conditional questions", async () => {
    const draft = await createDraft();
    const response = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.test_parent, booleanValue: false },
      { questionId: questionIds.test_child, textValue: "Not applicable" },
    ]);
    expect(response.status).toBe(400);
    expect(response.body.details.code).toBe("CONDITIONAL_QUESTION_NOT_APPLICABLE");
  });

  it("finalizes atomically and prevents edits afterward", async () => {
    const draft = await createDraft();
    await saveAnswers(draft.body.data.submission.submissionId, fullValidAnswers());
    const submitted = await finalize(draft.body.data.submission.submissionId, true);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.submission.status).toBe("PENDING");
    expect(submitted.body.data.submission.submittedAt).toBeTruthy();
    expect(await prisma.notification.count({
      where: { userId: donorUser.userId, type: "QUESTIONNAIRE_SUBMITTED" },
    })).toBe(1);
    expect(await prisma.emailOutbox.count({
      where: { recipientEmail: donorUser.email, template: "QUESTIONNAIRE_SUBMITTED" },
    })).toBe(1);
    expect(await prisma.smsOutbox.count({
      where: { eventKey: `questionnaire-${draft.body.data.submission.submissionId}-submitted:sms` },
    })).toBe(0);

    const edit = await saveAnswers(draft.body.data.submission.submissionId, [
      { questionId: questionIds.health_1_1, booleanValue: true },
    ]);
    expect(edit.status).toBe(409);
    expect(edit.body.details.code).toBe("SUBMISSION_LOCKED");

    const deleteResponse = await request(app)
      .delete(`/api/donor/questionnaire/submissions/${draft.body.data.submission.submissionId}/answers/${questionIds.health_1_1}`)
      .set("Authorization", `Bearer ${donorToken}`);
    expect(deleteResponse.status).toBe(409);
  });

  it("recalculates derived parent answers from subsection answers", async () => {
    const draft = await createDraft();
    const answers = fullValidAnswers();
    answers.find(answer => answer.questionId === questionIds.health_1_5b).booleanValue = true;
    await saveAnswers(draft.body.data.submission.submissionId, answers);

    const submitted = await finalize(draft.body.data.submission.submissionId);
    expect(submitted.status).toBe(200);
    const derivedAnswer = await prisma.questionnaireAnswer.findUnique({
      where: {
        submissionId_questionId: {
          submissionId: draft.body.data.submission.submissionId,
          questionId: questionIds.health_1_5,
        },
      },
    });
    expect(derivedAnswer.booleanValue).toBe(true);
  });

  it("lists only submissions owned by the authenticated donor", async () => {
    await createDraft();
    const otherDonor = await prisma.donor.findFirst({ where: { donorId: { not: donor.donorId } }, select: { donorId: true } });
    if (!otherDonor) throw new Error("Test database needs a second donor fixture.");
    const foreign = await prisma.donorQuestionnaireSubmission.create({
      data: { donorId: otherDonor.donorId, versionId: version.questionnaireVersionId, status: "DRAFT" },
      select: { submissionId: true },
    });
    otherSubmissionId = foreign.submissionId;

    const response = await request(app)
      .get("/api/donor/questionnaire/submissions")
      .set("Authorization", `Bearer ${donorToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.submissions.every(item => item.submissionId !== foreign.submissionId)).toBe(true);
    expect(response.body.data.submissions.every(item => item.status !== undefined)).toBe(true);
  });

  it("captures donor information at submission time rather than draft creation", async () => {
    const originalFirstName = donor.firstName;
    try {
      await prisma.donor.update({ where: { donorId: donor.donorId }, data: { firstName: "Draft Time Name" } });
      const draft = await createDraft();
      await prisma.donor.update({ where: { donorId: donor.donorId }, data: { firstName: "Submission Time Name" } });
      await saveAnswers(draft.body.data.submission.submissionId, fullValidAnswers());

      const submitted = await finalize(draft.body.data.submission.submissionId);
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.submission.donorInformationSnapshot.firstName).toBe("Submission Time Name");
    } finally {
      await prisma.donor.update({ where: { donorId: donor.donorId }, data: { firstName: originalFirstName } });
    }
  });

  it("prevents a second pending submission for the same donor", async () => {
    const first = await createDraft();
    await saveAnswers(first.body.data.submission.submissionId, fullValidAnswers());
    expect((await finalize(first.body.data.submission.submissionId)).status).toBe(200);

    const second = await createDraft();
    expect(second.status).toBe(409);
    expect(second.body.details.code).toBe("PENDING_SUBMISSION_EXISTS");
  });

  it("handles concurrent duplicate finalization safely", async () => {
    const draft = await createDraft();
    await saveAnswers(draft.body.data.submission.submissionId, fullValidAnswers());
    const responses = await Promise.all([
      finalize(draft.body.data.submission.submissionId),
      finalize(draft.body.data.submission.submissionId),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.donorQuestionnaireSubmission.count({
      where: { submissionId: draft.body.data.submission.submissionId, status: "PENDING" },
    })).toBe(1);
  });
});
