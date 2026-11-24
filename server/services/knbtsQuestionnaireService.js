const prisma = require("./prisma");
const { notifyUser } = require("./notificationDelivery");

class KnbtsQuestionnaireError extends Error {
  constructor(message, statusCode = 400, code = "QUESTIONNAIRE_OPERATION_FAILED", details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const APPROVAL_DURATION_MS = 336 * 60 * 60 * 1000;

const resolveKnbtsStaff = async (userId) => {
  const staff = await prisma.knbtsStaff.findUnique({
    where: { userId },
    include: { centre: true },
  });
  if (!staff || !staff.centre ||
      staff.centre.institutionType !== "KNBTS_CENTRE" ||
      !staff.centre.isActive) {
    throw new KnbtsQuestionnaireError(
      "KNBTS staff must be linked to an active KNBTS centre.",
      403,
      "KNBTS_CENTRE_NOT_ELIGIBLE"
    );
  }
  return staff;
};

const parsePositiveInteger = (value) => {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const normalizeText = (value) => typeof value === "string"
  ? value.trim().replace(/\s+/g, " ")
  : "";

const getDatabaseClock = async (tx) => {
  const rows = await tx.$queryRaw`SELECT NOW() AS "databaseNow"`;
  const now = rows[0]?.databaseNow instanceof Date ? rows[0].databaseNow : new Date(rows[0]?.databaseNow);
  if (!Number.isFinite(now.getTime())) {
    throw new KnbtsQuestionnaireError("Database time could not be verified.", 503, "DATABASE_CLOCK_UNAVAILABLE");
  }
  return now;
};

const getPendingQueue = async (userId, query = {}) => {
  await resolveKnbtsStaff(userId);
  const page = parsePositiveInteger(query.page) || 1;
  const pageSizeValue = parsePositiveInteger(query.pageSize) || 20;
  const pageSize = Math.min(pageSizeValue, 100);

  const [submissions, total] = await Promise.all([
    prisma.donorQuestionnaireSubmission.findMany({
      where: { status: "PENDING" },
      orderBy: [{ submittedAt: "asc" }, { submissionId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        submissionId: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        donorInformationSnapshot: true,
        donor: {
          select: {
            donorId: true,
            firstName: true,
            lastName: true,
            bloodType: true,
            birthDate: true,
            user: { select: { email: true, phone: true } },
          },
        },
        version: {
          select: { questionnaireVersionId: true, versionNumber: true, title: true, status: true },
        },
      },
    }),
    prisma.donorQuestionnaireSubmission.count({ where: { status: "PENDING" } }),
  ]);

  return {
    submissions,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

const getSubmissionForReview = async (userId, submissionId) => {
  await resolveKnbtsStaff(userId);
  const id = parsePositiveInteger(submissionId);
  if (!id) throw new KnbtsQuestionnaireError("Invalid submission ID.", 400, "INVALID_SUBMISSION_ID");

  const submission = await prisma.donorQuestionnaireSubmission.findFirst({
    where: { submissionId: id, status: { in: ["PENDING", "APPROVED", "DECLINED"] } },
    include: {
      donor: { include: { user: { select: { email: true, phone: true } } } },
      version: true,
      answers: {
        orderBy: [{ question: { displayOrder: "asc" } }, { answeredAt: "asc" }],
        include: {
          question: { include: { options: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } } },
          answerOption: true,
        },
      },
      review: { include: { reviewerStaff: { include: { centre: true, user: { select: { email: true } } } } } },
      assessments: { orderBy: [{ assessmentDate: "desc" }, { clinicalAssessmentId: "desc" }], include: { assessedByKnbtsStaff: { include: { centre: true } } } },
      approvals: { orderBy: [{ approvedAt: "desc" }, { approvalId: "desc" }] },
    },
  });
  if (!submission) throw new KnbtsQuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
  return submission;
};

const recordReviewDecision = async (userId, submissionId, body = {}) => {
  const staff = await resolveKnbtsStaff(userId);
  const id = parsePositiveInteger(submissionId);
  if (!id) throw new KnbtsQuestionnaireError("Invalid submission ID.", 400, "INVALID_SUBMISSION_ID");

  const decision = typeof body.decision === "string" ? body.decision.trim().toUpperCase() : "";
  if (!["APPROVED", "DECLINED"].includes(decision)) {
    throw new KnbtsQuestionnaireError("Decision must be APPROVED or DECLINED.", 400, "INVALID_REVIEW_DECISION");
  }
  const declineReason = normalizeText(body.declineReason);
  if (decision === "DECLINED" && (!declineReason || declineReason.length > 2000)) {
    throw new KnbtsQuestionnaireError("A nonblank decline reason of at most 2000 characters is required.", 400, "INVALID_DECLINE_REASON");
  }
  const internalNote = body.internalNote == null ? null : normalizeText(body.internalNote);
  if (internalNote && internalNote.length > 2000) {
    throw new KnbtsQuestionnaireError("Internal notes cannot exceed 2000 characters.", 400, "INVALID_INTERNAL_NOTE");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT "submissionId", "donorId", "status"
        FROM "DonorQuestionnaireSubmission"
        WHERE "submissionId" = ${id}
        FOR UPDATE
      `;
      if (!locked.length) throw new KnbtsQuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
      if (locked[0].status !== "PENDING") {
        throw new KnbtsQuestionnaireError("This submission already has a final review decision.", 409, "SUBMISSION_ALREADY_REVIEWED");
      }
      const now = await getDatabaseClock(tx);
      const existing = await tx.questionnaireReview.findUnique({ where: { submissionId: id } });
      if (existing) throw new KnbtsQuestionnaireError("This submission already has a final review decision.", 409, "SUBMISSION_ALREADY_REVIEWED");

      const review = await tx.questionnaireReview.create({
        data: {
          submissionId: id,
          reviewerStaffId: staff.knbtsStaffId,
          decision,
          reviewedAt: now,
          declineReason: decision === "DECLINED" ? declineReason : null,
          internalNote,
        },
      });
      await tx.donorQuestionnaireSubmission.update({
        where: { submissionId: id },
        data: { status: decision === "APPROVED" ? "APPROVED" : "DECLINED" },
      });
      await tx.auditLog.create({
        data: {
          action: decision === "APPROVED" ? "QUESTIONNAIRE_REVIEW_APPROVED" : "QUESTIONNAIRE_REVIEW_DECLINED",
          entityType: "DonorQuestionnaireSubmission",
          entityId: String(id),
          actorUserId: userId,
          details: {
            reviewerStaffId: staff.knbtsStaffId,
            centreId: staff.centreId,
            decision,
            ...(decision === "DECLINED" ? { declineReason } : {}),
          },
        },
      });
      if (decision === "DECLINED") {
        const donor = await tx.donor.findUnique({
          where: { donorId: locked[0].donorId },
          select: {
            user: { select: { userId: true, email: true, phone: true } },
            firstName: true,
            lastName: true,
          },
        });
        await notifyUser(tx, {
          userId: donor?.user?.userId,
          email: donor?.user?.email,
          phone: donor?.user?.phone,
          eventKey: `questionnaire-${id}-declined`,
          type: "QUESTIONNAIRE_DECLINED",
          title: "Questionnaire decision recorded",
          message: "Your donor questionnaire was not approved by KNBTS. Sign in to review the decision and next steps.",
          emailTemplate: "QUESTIONNAIRE_DECLINED",
          emailPayload: { name: `${donor?.firstName || ""} ${donor?.lastName || ""}`.trim() },
          smsMessage: "Your HemoConnect donor questionnaire was not approved by KNBTS. Sign in to review the decision and next steps.",
        });
      }
      return review;
    });
  } catch (error) {
    if (error instanceof KnbtsQuestionnaireError) throw error;
    if (error.code === "P2002") throw new KnbtsQuestionnaireError("This submission already has a final review decision.", 409, "SUBMISSION_ALREADY_REVIEWED");
    throw error;
  }
};

const recordClinicalAssessment = async (userId, submissionId, body = {}) => {
  const staff = await resolveKnbtsStaff(userId);
  const id = parsePositiveInteger(submissionId);
  if (!id) throw new KnbtsQuestionnaireError("Invalid submission ID.", 400, "INVALID_SUBMISSION_ID");

  const decision = typeof body.decision === "string" ? body.decision.trim().toUpperCase() : "";
  if (!["ACCEPT", "DEFER"].includes(decision)) {
    throw new KnbtsQuestionnaireError("Decision must be ACCEPT or DEFER.", 400, "INVALID_ASSESSMENT_DECISION");
  }

  const weight = typeof body.weightKg === "number" ? body.weightKg : Number(body.weightKg);
  if (!Number.isFinite(weight) || weight < 20 || weight > 300) {
    throw new KnbtsQuestionnaireError("Weight must be between 20 and 300 kilograms.", 400, "INVALID_WEIGHT");
  }
  const bloodPressure = typeof body.bloodPressure === "string" ? body.bloodPressure.trim() : "";
  const bloodPressureMatch = /^(\d{2,3})\/(\d{2,3})$/.exec(bloodPressure);
  if (!bloodPressureMatch ||
      Number(bloodPressureMatch[1]) < 50 || Number(bloodPressureMatch[1]) > 300 ||
      Number(bloodPressureMatch[2]) < 30 || Number(bloodPressureMatch[2]) > 200 ||
      Number(bloodPressureMatch[1]) <= Number(bloodPressureMatch[2])) {
    throw new KnbtsQuestionnaireError("Blood pressure must use systolic/diastolic format.", 400, "INVALID_BLOOD_PRESSURE");
  }

  let deferralPeriodDays = null;
  let deferralUntil = null;
  let reason = null;
  const suppliedDeferralPeriod = body.deferralPeriodDays ?? body.deferralPeriod;
  if (decision === "DEFER") {
    deferralPeriodDays = parsePositiveInteger(suppliedDeferralPeriod);
    reason = normalizeText(body.reason ?? body.deferralReason);
    if (!deferralPeriodDays || deferralPeriodDays > 3650) {
      throw new KnbtsQuestionnaireError("A deferral period of 1 to 3650 days is required.", 400, "INVALID_DEFERRAL_PERIOD");
    }
    if (!reason || reason.length > 2000) {
      throw new KnbtsQuestionnaireError("A meaningful deferral reason is required.", 400, "INVALID_DEFERRAL_REASON");
    }
  }

  const appointmentId = body.appointmentId == null ? null : parsePositiveInteger(body.appointmentId);
  if (body.appointmentId != null && !appointmentId) {
    throw new KnbtsQuestionnaireError("Invalid appointment ID.", 400, "INVALID_APPOINTMENT_ID");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT "submissionId", "donorId", "status"
        FROM "DonorQuestionnaireSubmission"
        WHERE "submissionId" = ${id}
        FOR UPDATE
      `;
      if (!locked.length) throw new KnbtsQuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
      const submission = locked[0];
      if (!["PENDING", "APPROVED"].includes(submission.status)) {
        throw new KnbtsQuestionnaireError("Clinical assessment is not permitted for this submission.", 409, "ASSESSMENT_NOT_PERMITTED");
      }

      const now = await getDatabaseClock(tx);
      let assessmentDate = now;
      if (body.assessmentDate != null) {
        const suppliedAssessmentDate = new Date(body.assessmentDate);
        if (!Number.isFinite(suppliedAssessmentDate.getTime())) {
          throw new KnbtsQuestionnaireError("Invalid assessment date.", 400, "INVALID_ASSESSMENT_DATE");
        }
        assessmentDate = suppliedAssessmentDate;
      }
      if (decision === "DEFER") {
        if (body.deferralUntil != null) {
          deferralUntil = new Date(body.deferralUntil);
          if (!Number.isFinite(deferralUntil.getTime())) {
            throw new KnbtsQuestionnaireError("Invalid deferral end date.", 400, "INVALID_DEFERRAL_UNTIL");
          }
          deferralUntil = new Date(Date.UTC(
            deferralUntil.getUTCFullYear(),
            deferralUntil.getUTCMonth(),
            deferralUntil.getUTCDate()
          ));
        } else {
          deferralUntil = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + deferralPeriodDays));
        }
      }

      if (appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: { appointmentId, donorId: submission.donorId },
          select: { appointmentId: true },
        });
        if (!appointment) throw new KnbtsQuestionnaireError("Appointment does not belong to this donor.", 404, "APPOINTMENT_NOT_FOUND");
      }

      const review = await tx.questionnaireReview.findUnique({ where: { submissionId: id } });
      const assessment = await tx.questionnaireClinicalAssessment.create({
        data: {
          submissionId: id,
          donorId: submission.donorId,
          assessedByKnbtsStaffId: staff.knbtsStaffId,
          reviewId: review?.reviewId || null,
          appointmentId,
          assessmentDate,
          decision,
          weightKg: weight.toFixed(2),
          bloodPressure,
          deferralPeriodDays,
          deferralUntil,
          reason,
        },
      });
      await tx.auditLog.create({
        data: {
          action: decision === "ACCEPT" ? "QUESTIONNAIRE_CLINICAL_ACCEPTED" : "QUESTIONNAIRE_CLINICAL_DEFERRED",
          entityType: "DonorQuestionnaireSubmission",
          entityId: String(id),
          actorUserId: userId,
          details: {
            reviewerStaffId: staff.knbtsStaffId,
            centreId: staff.centreId,
            clinicalAssessmentId: assessment.clinicalAssessmentId,
            decision,
            weightKg: weight,
            bloodPressure,
            ...(decision === "DEFER" ? { deferralPeriodDays, deferralUntil: deferralUntil.toISOString(), reason } : {}),
          },
        },
      });
      return assessment;
    });
  } catch (error) {
    if (error instanceof KnbtsQuestionnaireError) throw error;
    throw error;
  }
};

const expireActiveApprovals = async (tx, donorId, now) => {
  await tx.questionnaireApproval.updateMany({
    where: {
      donorId,
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
};

const issueApproval = async (userId, submissionId) => {
  const staff = await resolveKnbtsStaff(userId);
  const id = parsePositiveInteger(submissionId);
  if (!id) throw new KnbtsQuestionnaireError("Invalid submission ID.", 400, "INVALID_SUBMISSION_ID");

  try {
    return await prisma.$transaction(async (tx) => {
      const lockedSubmission = await tx.$queryRaw`
        SELECT "submissionId", "donorId", "status"
        FROM "DonorQuestionnaireSubmission"
        WHERE "submissionId" = ${id}
        FOR UPDATE
      `;
      if (!lockedSubmission.length) throw new KnbtsQuestionnaireError("Questionnaire submission not found.", 404, "SUBMISSION_NOT_FOUND");
      const submission = lockedSubmission[0];
      if (submission.status === "DECLINED") {
        throw new KnbtsQuestionnaireError("Approval cannot be issued for a declined submission.", 409, "DECLINED_SUBMISSION");
      }
      if (submission.status !== "APPROVED") {
        throw new KnbtsQuestionnaireError("The submission must be reviewed and approved before approval issuance.", 409, "REVIEW_NOT_APPROVED");
      }

      const review = await tx.questionnaireReview.findUnique({ where: { submissionId: id } });
      if (!review || review.decision !== "APPROVED") {
        throw new KnbtsQuestionnaireError("An approved questionnaire review is required.", 409, "REVIEW_NOT_APPROVED");
      }
      const assessment = await tx.questionnaireClinicalAssessment.findFirst({
        where: { submissionId: id, donorId: submission.donorId },
        orderBy: [{ assessmentDate: "desc" }, { clinicalAssessmentId: "desc" }],
      });
      if (!assessment || assessment.decision !== "ACCEPT") {
        throw new KnbtsQuestionnaireError("An accepted clinical assessment is required.", 409, "CLINICAL_NOT_ACCEPTED");
      }

      await tx.$queryRaw`
        SELECT "donorId"
        FROM "Donor"
        WHERE "donorId" = ${submission.donorId}
        FOR UPDATE
      `;
      const now = await getDatabaseClock(tx);
      await expireActiveApprovals(tx, submission.donorId, now);

      const active = await tx.questionnaireApproval.findFirst({
        where: { donorId: submission.donorId, status: "ACTIVE", expiresAt: { gt: now } },
      });
      if (active) throw new KnbtsQuestionnaireError("The donor already has an active approval.", 409, "ACTIVE_APPROVAL_EXISTS");

      const approvedAt = now;
      const expiresAt = new Date(now.getTime() + APPROVAL_DURATION_MS);
      const approval = await tx.questionnaireApproval.create({
        data: {
          submissionId: id,
          donorId: submission.donorId,
          reviewId: review.reviewId,
          approvedAt,
          expiresAt,
          status: "ACTIVE",
        },
      });
      await tx.auditLog.create({
        data: {
          action: "QUESTIONNAIRE_APPROVAL_ISSUED",
          entityType: "QuestionnaireApproval",
          entityId: String(approval.approvalId),
          actorUserId: userId,
          details: {
            reviewerStaffId: staff.knbtsStaffId,
            centreId: staff.centreId,
            submissionId: id,
            donorId: submission.donorId,
            approvedAt: approvedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            validityHours: 336,
          },
        },
      });
      const donor = await tx.donor.findUnique({
        where: { donorId: submission.donorId },
        select: {
          user: { select: { userId: true, email: true, phone: true } },
          firstName: true,
          lastName: true,
        },
      });
      await notifyUser(tx, {
        userId: donor?.user?.userId,
        email: donor?.user?.email,
        phone: donor?.user?.phone,
        eventKey: `questionnaire-${id}-approved`,
        type: "QUESTIONNAIRE_APPROVED",
        title: "Questionnaire approved",
        message: "KNBTS approved your donor questionnaire. Your approval is active; sign in to book an appointment.",
        emailTemplate: "QUESTIONNAIRE_APPROVED",
        emailPayload: {
          name: `${donor?.firstName || ""} ${donor?.lastName || ""}`.trim(),
          expiresAt,
        },
        smsMessage: `KNBTS approved your HemoConnect donor questionnaire. Approval valid until ${expiresAt.toISOString().slice(0, 10)}. Sign in to book an appointment.`,
      });
      return approval;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof KnbtsQuestionnaireError) throw error;
    if (error.code === "P2002") throw new KnbtsQuestionnaireError("The donor already has an active approval.", 409, "ACTIVE_APPROVAL_EXISTS");
    throw error;
  }
};

const listApprovals = async (userId, query = {}) => {
  await resolveKnbtsStaff(userId);
  const page = parsePositiveInteger(query.page) || 1;
  const pageSize = Math.min(parsePositiveInteger(query.pageSize) || 20, 100);
  const status = typeof query.status === "string" ? query.status.trim().toUpperCase() : null;
  if (status && !["ACTIVE", "CONSUMED", "EXPIRED"].includes(status)) {
    throw new KnbtsQuestionnaireError("Invalid approval status.", 400, "INVALID_APPROVAL_STATUS");
  }

  const nowRows = await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`;
  const now = nowRows[0].databaseNow instanceof Date ? nowRows[0].databaseNow : new Date(nowRows[0].databaseNow);
  await prisma.questionnaireApproval.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: now }, ...(status ? { status } : {}) },
    data: { status: "EXPIRED" },
  });

  const where = status ? { status } : {};
  const [approvals, total] = await Promise.all([
    prisma.questionnaireApproval.findMany({
      where,
      orderBy: [{ approvedAt: "desc" }, { approvalId: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        donor: { include: { user: { select: { email: true, phone: true } } } },
        submission: { select: { submissionId: true, status: true, submittedAt: true, donorInformationSnapshot: true } },
        review: { include: { reviewerStaff: { include: { centre: true } } } },
      },
    }),
    prisma.questionnaireApproval.count({ where }),
  ]);
  return {
    approvals: approvals.map((approval) => ({
      ...approval,
      valid: approval.status === "ACTIVE" && approval.expiresAt > now,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
};

const getApproval = async (userId, approvalId) => {
  await resolveKnbtsStaff(userId);
  const id = parsePositiveInteger(approvalId);
  if (!id) throw new KnbtsQuestionnaireError("Invalid approval ID.", 400, "INVALID_APPROVAL_ID");

  const nowRows = await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`;
  const now = nowRows[0].databaseNow instanceof Date ? nowRows[0].databaseNow : new Date(nowRows[0].databaseNow);
  const approval = await prisma.questionnaireApproval.findUnique({
    where: { approvalId: id },
    include: {
      donor: { include: { user: { select: { email: true, phone: true } } } },
      submission: { include: { donor: true, version: true } },
      review: { include: { reviewerStaff: { include: { centre: true } } } },
    },
  });
  if (!approval) throw new KnbtsQuestionnaireError("Approval not found.", 404, "APPROVAL_NOT_FOUND");

  let status = approval.status;
  if (status === "ACTIVE" && approval.expiresAt <= now) {
    await prisma.questionnaireApproval.update({ where: { approvalId: id }, data: { status: "EXPIRED" } });
    status = "EXPIRED";
  }
  const assessments = await prisma.questionnaireClinicalAssessment.findMany({
    where: { submissionId: approval.submissionId, donorId: approval.donorId },
    orderBy: [{ assessmentDate: "desc" }, { clinicalAssessmentId: "desc" }],
  });
  return {
    ...approval,
    status,
    valid: status === "ACTIVE" && now < approval.expiresAt,
    assessments,
  };
};

module.exports = {
  KnbtsQuestionnaireError,
  APPROVAL_DURATION_MS,
  getPendingQueue,
  getSubmissionForReview,
  recordReviewDecision,
  recordClinicalAssessment,
  issueApproval,
  listApprovals,
  getApproval,
};
