const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const prisma = require("../services/prisma");
const env = require("../config/env");

describe("KNBTS questionnaire review, assessment and approval workflow", () => {
  let knbtsToken;
  let knbtsUser;
  let knbtsStaff;
  let donorToken;
  let donorUser;
  let donor;
  let publishedVersion;
  const submissionIds = [];
  const auditIds = [];

  const tokenFor = (user) => jwt.sign(
    { userId: user.userId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  const createPendingSubmission = async () => {
    const submission = await prisma.donorQuestionnaireSubmission.create({
      data: {
        donorId: donor.donorId,
        versionId: publishedVersion.questionnaireVersionId,
        status: "PENDING",
        submittedAt: new Date(),
        declarationAcknowledgedAt: new Date(),
        donorInformationSnapshot: {
          firstName: donor.firstName,
          lastName: donor.lastName,
        },
      },
    });
    submissionIds.push(submission.submissionId);
    return submission;
  };

  beforeAll(async () => {
    [knbtsUser, donorUser] = await Promise.all([
      prisma.user.findUnique({
        where: { email: "knbts1@hemoconnect.co.ke" },
        include: { knbtsStaff: { include: { centre: true } } },
      }),
      prisma.user.findUnique({
        where: { email: "donor1@hemoconnect.co.ke" },
        include: { donor: true },
      }),
    ]);
    if (!knbtsUser?.knbtsStaff || !knbtsUser.knbtsStaff.centre ||
        knbtsUser.knbtsStaff.centre.institutionType !== "KNBTS_CENTRE" ||
        !knbtsUser.knbtsStaff.centre.isActive) {
      throw new Error("KNBTS test profile is unavailable.");
    }
    if (!donorUser?.donor) throw new Error("Donor test profile is unavailable.");
    knbtsToken = tokenFor(knbtsUser);
    donorToken = tokenFor(donorUser);
    knbtsStaff = knbtsUser.knbtsStaff;
    donor = donorUser.donor;
    publishedVersion = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: Math.floor(Date.now() / 1000),
        title: "Task 5 test fixture",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.questionnaireVersion.delete({
      where: { questionnaireVersionId: publishedVersion.questionnaireVersionId },
    });
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { userId: donorUser.userId, type: { in: ["QUESTIONNAIRE_DECLINED", "QUESTIONNAIRE_APPROVED"] } },
    });
    await prisma.emailOutbox.deleteMany({
      where: {
        recipientEmail: donorUser.email,
        template: { in: ["QUESTIONNAIRE_DECLINED", "QUESTIONNAIRE_APPROVED"] },
      },
    });
    await prisma.smsOutbox.deleteMany({
      where: {
        eventKey: {
          in: submissionIds.flatMap((id) => [
            `questionnaire-${id}-declined:sms`,
            `questionnaire-${id}-approved:sms`,
          ]),
        },
      },
    });
    if (submissionIds.length) {
      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ["DonorQuestionnaireSubmission", "QuestionnaireApproval"] },
          entityId: { in: submissionIds.map(String) },
        },
      });
      await prisma.questionnaireApproval.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.questionnaireClinicalAssessment.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.questionnaireReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.questionnaireAnswer.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await prisma.donorQuestionnaireSubmission.deleteMany({ where: { submissionId: { in: submissionIds } } });
      submissionIds.length = 0;
    }
    if (auditIds.length) {
      await prisma.auditLog.deleteMany({ where: { auditLogId: { in: auditIds } } });
      auditIds.length = 0;
    }
  });

  it("rejects donor access and lists only pending submissions", async () => {
    const submission = await createPendingSubmission();
    const forbidden = await request(app)
      .get("/api/knbts/questionnaire/submissions")
      .set("Authorization", `Bearer ${donorToken}`);
    expect(forbidden.status).toBe(403);

    const response = await request(app)
      .get("/api/knbts/questionnaire/submissions")
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.submissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ submissionId: submission.submissionId, status: "PENDING" }),
    ]));
  });

  it("retrieves an individual structured submission", async () => {
    const submission = await createPendingSubmission();
    const response = await request(app)
      .get(`/api/knbts/questionnaire/submissions/${submission.submissionId}`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.submissionId).toBe(submission.submissionId);
  });

  it("records an approved review and prevents a duplicate decision", async () => {
    const submission = await createPendingSubmission();
    const first = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "APPROVED", internalNote: "Reviewed" });
    expect(first.status).toBe(200);
    expect(first.body.data.decision).toBe("APPROVED");

    const duplicate = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "DECLINED", declineReason: "Conflict" });
    expect(duplicate.status).toBe(409);
  });

  it("records a normalized declined review and rejects blank reasons", async () => {
    const blankSubmission = await createPendingSubmission();
    const blank = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${blankSubmission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "DECLINED", declineReason: "   " });
    expect(blank.status).toBe(400);
    await prisma.donorQuestionnaireSubmission.delete({
      where: { submissionId: blankSubmission.submissionId },
    });
    submissionIds.splice(submissionIds.indexOf(blankSubmission.submissionId), 1);

    const submission = await createPendingSubmission();
    const response = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "DECLINED", declineReason: "  Answer   inconsistency  " });
    expect(response.status).toBe(200);
    expect(response.body.data.declineReason).toBe("Answer inconsistency");
  });

  it("handles concurrent review attempts with only one final decision", async () => {
    const submission = await createPendingSubmission();
    const responses = await Promise.all([
      request(app).post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
        .set("Authorization", `Bearer ${knbtsToken}`).send({ decision: "APPROVED" }),
      request(app).post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
        .set("Authorization", `Bearer ${knbtsToken}`).send({ decision: "DECLINED", declineReason: "Concurrent conflict" }),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
  });

  it("records ACCEPT and DEFER assessments and requires deferral details", async () => {
    const acceptSubmission = await createPendingSubmission();
    const accept = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${acceptSubmission.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "ACCEPT", weightKg: 72.5, bloodPressure: "120/80" });
    expect(accept.status).toBe(200);
    expect(accept.body.data.decision).toBe("ACCEPT");

    await prisma.questionnaireClinicalAssessment.deleteMany({
      where: { submissionId: acceptSubmission.submissionId },
    });
    await prisma.questionnaireApproval.deleteMany({
      where: { submissionId: acceptSubmission.submissionId },
    });
    await prisma.questionnaireReview.deleteMany({
      where: { submissionId: acceptSubmission.submissionId },
    });
    await prisma.donorQuestionnaireSubmission.delete({
      where: { submissionId: acceptSubmission.submissionId },
    });
    submissionIds.splice(submissionIds.indexOf(acceptSubmission.submissionId), 1);

    const deferSubmission = await createPendingSubmission();
    const missing = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${deferSubmission.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "DEFER", weightKg: 72.5, bloodPressure: "120/80" });
    expect(missing.status).toBe(400);

    const defer = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${deferSubmission.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({
        decision: "DEFER",
        weightKg: 72.5,
        bloodPressure: "120/80",
        deferralPeriodDays: 30,
        reason: "Temporary iron deficiency",
      });
    expect(defer.status).toBe(200);
    expect(defer.body.data.decision).toBe("DEFER");
  });

  it("requires approved review and accepted assessment before approval issuance", async () => {
    const declined = await createPendingSubmission();
    await request(app).post(`/api/knbts/questionnaire/submissions/${declined.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "DECLINED", declineReason: "Not eligible" });
    const declinedApproval = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${declined.submissionId}/approval`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(declinedApproval.status).toBe(409);

    const deferred = await createPendingSubmission();
    await request(app).post(`/api/knbts/questionnaire/submissions/${deferred.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "APPROVED" });
    await request(app).post(`/api/knbts/questionnaire/submissions/${deferred.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "DEFER", weightKg: 72.5, bloodPressure: "120/80", deferralPeriodDays: 30, reason: "Temporary deferral" });
    const deferredApproval = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${deferred.submissionId}/approval`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(deferredApproval.status).toBe(409);
  });

  it("issues a 336-hour approval and prevents duplicate active approvals", async () => {
    const submission = await createPendingSubmission();
    await request(app).post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`).send({ decision: "APPROVED" });
    await request(app).post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "ACCEPT", weightKg: 72.5, bloodPressure: "120/80" });

    const first = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/approval`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(first.status).toBe(201);
    expect(new Date(first.body.data.expiresAt).getTime() - new Date(first.body.data.approvedAt).getTime())
      .toBe(336 * 60 * 60 * 1000);
    expect(await prisma.notification.count({
      where: { userId: donorUser.userId, type: "QUESTIONNAIRE_APPROVED" },
    })).toBe(1);
    expect(await prisma.emailOutbox.count({
      where: { recipientEmail: donorUser.email, template: "QUESTIONNAIRE_APPROVED" },
    })).toBe(1);
    expect(await prisma.smsOutbox.count({
      where: { eventKey: `questionnaire-${submission.submissionId}-approved:sms`, status: "QUEUED" },
    })).toBe(1);

    const duplicate = await request(app)
      .post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/approval`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(duplicate.status).toBe(409);
  });

  it("transitions expired ACTIVE approvals and preserves historical status", async () => {
    const submission = await createPendingSubmission();
    await request(app).post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/review`)
      .set("Authorization", `Bearer ${knbtsToken}`).send({ decision: "APPROVED" });
    await request(app).post(`/api/knbts/questionnaire/submissions/${submission.submissionId}/assessment`)
      .set("Authorization", `Bearer ${knbtsToken}`)
      .send({ decision: "ACCEPT", weightKg: 72.5, bloodPressure: "120/80" });

    const nowRows = await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`;
    const now = nowRows[0].databaseNow;
    const review = await prisma.questionnaireReview.findUnique({ where: { submissionId: submission.submissionId } });
    const approval = await prisma.questionnaireApproval.create({
      data: {
        submissionId: submission.submissionId,
        donorId: donor.donorId,
        reviewId: review.reviewId,
        approvedAt: new Date(now.getTime() - 337 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 1000),
        status: "ACTIVE",
      },
    });

    const detail = await request(app)
      .get(`/api/knbts/questionnaire/approvals/${approval.approvalId}`)
      .set("Authorization", `Bearer ${knbtsToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.valid).toBe(false);
    expect(detail.body.data.status).toBe("EXPIRED");

    const stored = await prisma.questionnaireApproval.findUnique({ where: { approvalId: approval.approvalId } });
    expect(stored.status).toBe("EXPIRED");
  });
});
