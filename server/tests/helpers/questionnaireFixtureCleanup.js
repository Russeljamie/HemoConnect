const createQuestionnaireFixtureCleanup = (prisma) => {
  const versionIds = new Set();
  const submissionIds = new Set();

  const trackVersion = (versionOrId) => {
    const id = typeof versionOrId === "object"
      ? versionOrId?.questionnaireVersionId
      : versionOrId;
    if (!Number.isInteger(id)) throw new Error("A questionnaire version ID is required for cleanup.");
    versionIds.add(id);
  };

  const trackSubmission = (submissionOrId) => {
    const id = typeof submissionOrId === "object"
      ? submissionOrId?.submissionId
      : submissionOrId;
    if (!Number.isInteger(id)) throw new Error("A questionnaire submission ID is required for cleanup.");
    submissionIds.add(id);
  };

  const cleanup = async ({ deleteVersions = false } = {}) => {
    const ownedSubmissionIds = [...submissionIds];
    const ownedVersionIds = deleteVersions ? [...versionIds] : [];
    if (!ownedSubmissionIds.length && !ownedVersionIds.length) return;

    await prisma.$transaction(async (tx) => {
      const approvalRows = ownedSubmissionIds.length
        ? await tx.questionnaireApproval.findMany({
          where: { submissionId: { in: ownedSubmissionIds } },
          select: { approvalId: true },
        })
        : [];
      const approvalIds = approvalRows.map(({ approvalId }) => approvalId);

      const auditScopes = [];
      if (ownedSubmissionIds.length) {
        auditScopes.push({
          entityType: "DonorQuestionnaireSubmission",
          entityId: { in: ownedSubmissionIds.map(String) },
        });
      }
      if (approvalIds.length) {
        auditScopes.push({
          entityType: "QuestionnaireApproval",
          entityId: { in: approvalIds.map(String) },
        });
      }
      if (auditScopes.length) {
        await tx.auditLog.deleteMany({ where: { OR: auditScopes } });
      }

      if (approvalIds.length) {
        await tx.questionnaireBookingAssociation.deleteMany({
          where: { approvalId: { in: approvalIds } },
        });
        await tx.questionnaireApproval.deleteMany({
          where: { approvalId: { in: approvalIds } },
        });
      }
      if (ownedSubmissionIds.length) {
        await tx.questionnaireClinicalAssessment.deleteMany({
          where: { submissionId: { in: ownedSubmissionIds } },
        });
        await tx.questionnaireReview.deleteMany({
          where: { submissionId: { in: ownedSubmissionIds } },
        });
        await tx.questionnaireAnswer.deleteMany({
          where: { submissionId: { in: ownedSubmissionIds } },
        });
        await tx.donorQuestionnaireSubmission.deleteMany({
          where: { submissionId: { in: ownedSubmissionIds } },
        });
      }

      if (ownedVersionIds.length) {
        const questions = await tx.questionnaireQuestion.findMany({
          where: { versionId: { in: ownedVersionIds } },
          select: { questionnaireQuestionId: true },
        });
        const questionIds = questions.map(({ questionnaireQuestionId }) => questionnaireQuestionId);
        if (questionIds.length) {
          await tx.questionnaireOption.deleteMany({
            where: { questionId: { in: questionIds } },
          });
          await tx.questionnaireQuestion.updateMany({
            where: {
              versionId: { in: ownedVersionIds },
              parentQuestionId: { in: questionIds },
            },
            data: { parentQuestionId: null },
          });
          await tx.questionnaireQuestion.deleteMany({
            where: { questionnaireQuestionId: { in: questionIds } },
          });
        }
        await tx.questionnaireVersion.deleteMany({
          where: { questionnaireVersionId: { in: ownedVersionIds } },
        });
      }
    });

    for (const id of ownedSubmissionIds) submissionIds.delete(id);
    for (const id of ownedVersionIds) versionIds.delete(id);
  };

  return { trackVersion, trackSubmission, cleanup };
};

module.exports = { createQuestionnaireFixtureCleanup };
