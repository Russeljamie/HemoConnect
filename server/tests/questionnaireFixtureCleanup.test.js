const prisma = require("../services/prisma");
const { createQuestionnaireFixtureCleanup } = require("./helpers/questionnaireFixtureCleanup");

const createVersion = () => prisma.questionnaireVersion.create({
  data: {
    versionNumber: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100000),
    title: "Test-only cleanup regression fixture",
    status: "PUBLISHED",
    publishedAt: new Date(),
  },
});

describe("questionnaire test fixture cleanup", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes owned workflow dependencies before deleting its questionnaire version", async () => {
    const cleanup = createQuestionnaireFixtureCleanup(prisma);
    const donor = await prisma.donor.findFirst();
    const knbtsStaff = await prisma.knbtsStaff.findFirst();
    const hospital = await prisma.hospital.findFirst();
    if (!donor || !knbtsStaff || !hospital) {
      throw new Error("The isolated test database needs donor, KNBTS, and hospital fixtures.");
    }

    let version;
    let question;
    let submission;
    let appointment;
    let review;
    let assessment;
    let approval;
    let association;
    try {
      version = await createVersion();
      cleanup.trackVersion(version);
      question = await prisma.questionnaireQuestion.create({
        data: {
          versionId: version.questionnaireVersionId,
          questionKey: "cleanup_regression",
          numberLabel: "TEST-1",
          prompt: "Cleanup regression test question.",
          answerType: "YES_NO",
          displayOrder: 0,
          required: true,
        },
      });
      submission = await prisma.donorQuestionnaireSubmission.create({
        data: {
          donorId: donor.donorId,
          versionId: version.questionnaireVersionId,
          status: "APPROVED",
          submittedAt: new Date(),
          declarationAcknowledgedAt: new Date(),
        },
      });
      cleanup.trackSubmission(submission);
      await prisma.questionnaireAnswer.create({
        data: {
          submissionId: submission.submissionId,
          versionId: version.questionnaireVersionId,
          questionId: question.questionnaireQuestionId,
          booleanValue: true,
        },
      });
      review = await prisma.questionnaireReview.create({
        data: {
          submissionId: submission.submissionId,
          reviewerStaffId: knbtsStaff.knbtsStaffId,
          decision: "APPROVED",
          reviewedAt: new Date(),
        },
      });
      assessment = await prisma.questionnaireClinicalAssessment.create({
        data: {
          submissionId: submission.submissionId,
          donorId: donor.donorId,
          assessedByKnbtsStaffId: knbtsStaff.knbtsStaffId,
          reviewId: review.reviewId,
          decision: "ACCEPT",
          weightKg: "72.50",
          bloodPressure: "120/80",
        },
      });
      approval = await prisma.questionnaireApproval.create({
        data: {
          submissionId: submission.submissionId,
          donorId: donor.donorId,
          reviewId: review.reviewId,
          approvedAt: new Date(),
          expiresAt: new Date(Date.now() + 336 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });
      appointment = await prisma.appointment.create({
        data: {
          donorId: donor.donorId,
          hospitalId: hospital.hospitalId,
          date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          time: "09:00",
          purpose: "Blood Donation",
          status: "SCHEDULED",
        },
      });
      association = await prisma.questionnaireBookingAssociation.create({
        data: {
          approvalId: approval.approvalId,
          appointmentId: appointment.appointmentId,
          authorizedAt: new Date(),
        },
      });
    } finally {
      try {
        await cleanup.cleanup({ deleteVersions: true });
      } finally {
        if (appointment) {
          await prisma.appointment.deleteMany({
            where: { appointmentId: appointment.appointmentId },
          });
        }
      }
    }

    expect(await prisma.questionnaireBookingAssociation.findUnique({
      where: { bookingAssociationId: association.bookingAssociationId },
    })).toBeNull();
    expect(await prisma.questionnaireApproval.findUnique({
      where: { approvalId: approval.approvalId },
    })).toBeNull();
    expect(await prisma.questionnaireClinicalAssessment.findUnique({
      where: { clinicalAssessmentId: assessment.clinicalAssessmentId },
    })).toBeNull();
    expect(await prisma.questionnaireReview.findUnique({
      where: { reviewId: review.reviewId },
    })).toBeNull();
    expect(await prisma.questionnaireAnswer.findFirst({
      where: { submissionId: submission.submissionId },
    })).toBeNull();
    expect(await prisma.donorQuestionnaireSubmission.findUnique({
      where: { submissionId: submission.submissionId },
    })).toBeNull();
    expect(await prisma.questionnaireQuestion.findUnique({
      where: { questionnaireQuestionId: question.questionnaireQuestionId },
    })).toBeNull();
    expect(await prisma.questionnaireVersion.findUnique({
      where: { questionnaireVersionId: version.questionnaireVersionId },
    })).toBeNull();
  });

  it("cleans up a partially-created fixture after setup fails", async () => {
    const cleanup = createQuestionnaireFixtureCleanup(prisma);
    let version;
    let submission;
    try {
      version = await createVersion();
      cleanup.trackVersion(version);
      const donor = await prisma.donor.findFirst();
      if (!donor) throw new Error("The isolated test database needs a donor fixture.");
      submission = await prisma.donorQuestionnaireSubmission.create({
        data: {
          donorId: donor.donorId,
          versionId: version.questionnaireVersionId,
          status: "DRAFT",
        },
      });
      cleanup.trackSubmission(submission);
      throw new Error("Simulated fixture setup failure.");
    } catch (error) {
      expect(error.message).toBe("Simulated fixture setup failure.");
    } finally {
      await cleanup.cleanup({ deleteVersions: true });
    }

    expect(await prisma.donorQuestionnaireSubmission.findUnique({
      where: { submissionId: submission.submissionId },
    })).toBeNull();
    expect(await prisma.questionnaireVersion.findUnique({
      where: { questionnaireVersionId: version.questionnaireVersionId },
    })).toBeNull();
  });

  it("does not delete another invocation's questionnaire fixtures", async () => {
    const cleanupA = createQuestionnaireFixtureCleanup(prisma);
    const cleanupB = createQuestionnaireFixtureCleanup(prisma);
    let versionA;
    let versionB;
    let submissionA;
    let submissionB;
    try {
      versionA = await createVersion();
      cleanupA.trackVersion(versionA);
      versionB = await createVersion();
      cleanupB.trackVersion(versionB);
      const donor = await prisma.donor.findFirst();
      if (!donor) throw new Error("The isolated test database needs a donor fixture.");
      submissionA = await prisma.donorQuestionnaireSubmission.create({
        data: { donorId: donor.donorId, versionId: versionA.questionnaireVersionId, status: "DRAFT" },
      });
      cleanupA.trackSubmission(submissionA);
      submissionB = await prisma.donorQuestionnaireSubmission.create({
        data: { donorId: donor.donorId, versionId: versionB.questionnaireVersionId, status: "DRAFT" },
      });
      cleanupB.trackSubmission(submissionB);

      await cleanupA.cleanup({ deleteVersions: true });
      expect(await prisma.questionnaireVersion.findUnique({
        where: { questionnaireVersionId: versionB.questionnaireVersionId },
      })).not.toBeNull();
      expect(await prisma.donorQuestionnaireSubmission.findUnique({
        where: { submissionId: submissionB.submissionId },
      })).not.toBeNull();
    } finally {
      await cleanupA.cleanup({ deleteVersions: true });
      await cleanupB.cleanup({ deleteVersions: true });
    }

    expect(await prisma.questionnaireVersion.findUnique({
      where: { questionnaireVersionId: versionA.questionnaireVersionId },
    })).toBeNull();
    expect(await prisma.questionnaireVersion.findUnique({
      where: { questionnaireVersionId: versionB.questionnaireVersionId },
    })).toBeNull();
  });
});
