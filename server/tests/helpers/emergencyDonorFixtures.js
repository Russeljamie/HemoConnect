const { createQuestionnaireFixtureCleanup } = require("./questionnaireFixtureCleanup");

const createEmergencyDonorFixtures = (prisma) => {
  const questionnaireCleanup = createQuestionnaireFixtureCleanup(prisma);
  const donors = [];
  const users = [];

  const createDonor = async ({
    label,
    bloodType = "O+",
    latitude = -1.286389,
    longitude = 36.817223,
    isEligible = true,
  } = {}) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        firstName: "Emergency",
        lastName: "Donor",
        email: `emergency-${label || "fixture"}-${suffix}@hemoconnect.test`,
        phone: `07${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
        password: "test-only-password",
        role: "DONOR",
        status: "ACTIVE",
      },
    });
    users.push(user.userId);
    const donor = await prisma.donor.create({
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        bloodType,
        birthDate: new Date("1996-05-10T00:00:00.000Z"),
        gender: "OTHER",
        address: "Nairobi",
        latitude,
        longitude,
        isEligible,
        userId: user.userId,
      },
    });
    donors.push(donor.donorId);
    return { user, donor };
  };

  const createApproval = async (donor, {
    status = "ACTIVE",
    expiresAt = new Date(Date.now() + 336 * 60 * 60 * 1000),
  } = {}) => {
    const databaseRows = await prisma.$queryRaw`SELECT NOW() AS "databaseNow"`;
    const now = databaseRows[0].databaseNow instanceof Date
      ? databaseRows[0].databaseNow
      : new Date(databaseRows[0].databaseNow);
    const latestVersion = await prisma.questionnaireVersion.findFirst({
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const version = await prisma.questionnaireVersion.create({
      data: {
        versionNumber: (latestVersion?.versionNumber || 0) + 1,
        title: "Emergency donor eligibility test fixture",
        status: "PUBLISHED",
        publishedAt: now,
      },
    });
    questionnaireCleanup.trackVersion(version);
    const submission = await prisma.donorQuestionnaireSubmission.create({
      data: {
        donorId: donor.donorId,
        versionId: version.questionnaireVersionId,
        status: "APPROVED",
        submittedAt: now,
        declarationAcknowledgedAt: now,
      },
    });
    questionnaireCleanup.trackSubmission(submission);
    const knbtsStaff = await prisma.knbtsStaff.findFirst();
    if (!knbtsStaff) throw new Error("Emergency donor fixtures require KNBTS staff.");
    const review = await prisma.questionnaireReview.create({
      data: {
        submissionId: submission.submissionId,
        reviewerStaffId: knbtsStaff.knbtsStaffId,
        decision: "APPROVED",
        reviewedAt: now,
      },
    });
    await prisma.questionnaireClinicalAssessment.create({
      data: {
        submissionId: submission.submissionId,
        donorId: donor.donorId,
        assessedByKnbtsStaffId: knbtsStaff.knbtsStaffId,
        reviewId: review.reviewId,
        decision: "ACCEPT",
        assessmentDate: now,
        weightKg: "72.50",
        bloodPressure: "120/80",
      },
    });
    return prisma.questionnaireApproval.create({
      data: {
        submissionId: submission.submissionId,
        donorId: donor.donorId,
        reviewId: review.reviewId,
        approvedAt: now,
        expiresAt,
        status,
      },
    });
  };

  const cleanup = async () => {
    await questionnaireCleanup.cleanup({ deleteVersions: true });
    if (donors.length) {
      await prisma.donor.deleteMany({ where: { donorId: { in: donors } } });
      donors.length = 0;
    }
    if (users.length) {
      await prisma.user.deleteMany({ where: { userId: { in: users } } });
      users.length = 0;
    }
  };

  return { createDonor, createApproval, cleanup };
};

module.exports = { createEmergencyDonorFixtures };
