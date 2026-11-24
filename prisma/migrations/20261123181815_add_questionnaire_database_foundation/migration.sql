/*
  Warnings:

  - A unique constraint covering the columns `[appointmentId,donorId]` on the table `Appointment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "QuestionnaireVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionnaireAnswerType" AS ENUM ('YES_NO', 'TEXT', 'DATE', 'NUMBER', 'OPTION', 'DECLARATION_ACKNOWLEDGEMENT', 'DERIVED_YES_NO');

-- CreateEnum
CREATE TYPE "QuestionnaireSubmissionStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "QuestionnaireReviewDecision" AS ENUM ('APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "QuestionnaireClinicalDecision" AS ENUM ('ACCEPT', 'DEFER');

-- CreateEnum
CREATE TYPE "QuestionnaireApprovalStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestionnaireBookingAssociationStatus" AS ENUM ('ACTIVE', 'CANCELLED_RELEASED', 'CANCELLED_EXPIRED', 'COMPLETED_CONSUMED');

-- CreateEnum
CREATE TYPE "QuestionnaireTravelPeriodUnit" AS ENUM ('MONTHS', 'YEARS');

-- CreateTable
CREATE TABLE "QuestionnaireVersion" (
    "questionnaireVersionId" SERIAL NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "QuestionnaireVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireVersion_pkey" PRIMARY KEY ("questionnaireVersionId")
);

-- CreateTable
CREATE TABLE "QuestionnaireQuestion" (
    "questionnaireQuestionId" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "questionKey" TEXT NOT NULL,
    "numberLabel" TEXT NOT NULL,
    "subsectionLabel" TEXT,
    "prompt" TEXT NOT NULL,
    "answerType" "QuestionnaireAnswerType" NOT NULL,
    "parentQuestionId" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "isDerived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireQuestion_pkey" PRIMARY KEY ("questionnaireQuestionId")
);

-- CreateTable
CREATE TABLE "QuestionnaireOption" (
    "optionId" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "optionKey" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireOption_pkey" PRIMARY KEY ("optionId")
);

-- CreateTable
CREATE TABLE "DonorQuestionnaireSubmission" (
    "submissionId" SERIAL NOT NULL,
    "donorId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "status" "QuestionnaireSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "declarationAcknowledgedAt" TIMESTAMP(3),
    "donorInformationSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonorQuestionnaireSubmission_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "QuestionnaireAnswer" (
    "answerId" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answerOptionId" INTEGER,
    "textValue" TEXT,
    "dateValue" DATE,
    "numberValue" DOUBLE PRECISION,
    "booleanValue" BOOLEAN,
    "travelPeriodValue" INTEGER,
    "travelPeriodUnit" "QuestionnaireTravelPeriodUnit",
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireAnswer_pkey" PRIMARY KEY ("answerId")
);

-- CreateTable
CREATE TABLE "QuestionnaireReview" (
    "reviewId" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "reviewerStaffId" INTEGER NOT NULL,
    "decision" "QuestionnaireReviewDecision" NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "declineReason" TEXT,
    "internalNote" TEXT,

    CONSTRAINT "QuestionnaireReview_pkey" PRIMARY KEY ("reviewId")
);

-- CreateTable
CREATE TABLE "QuestionnaireClinicalAssessment" (
    "clinicalAssessmentId" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "donorId" INTEGER NOT NULL,
    "assessedByKnbtsStaffId" INTEGER NOT NULL,
    "reviewId" INTEGER,
    "appointmentId" INTEGER,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "QuestionnaireClinicalDecision" NOT NULL,
    "weightKg" DECIMAL(5,2),
    "bloodPressure" TEXT,
    "deferralPeriodDays" INTEGER,
    "deferralUntil" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireClinicalAssessment_pkey" PRIMARY KEY ("clinicalAssessmentId")
);

-- CreateTable
CREATE TABLE "QuestionnaireApproval" (
    "approvalId" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "donorId" INTEGER NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "QuestionnaireApprovalStatus" NOT NULL DEFAULT 'ACTIVE',
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireApproval_pkey" PRIMARY KEY ("approvalId")
);

-- CreateTable
CREATE TABLE "QuestionnaireBookingAssociation" (
    "bookingAssociationId" SERIAL NOT NULL,
    "approvalId" INTEGER NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "status" "QuestionnaireBookingAssociationStatus" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireBookingAssociation_pkey" PRIMARY KEY ("bookingAssociationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireVersion_versionNumber_key" ON "QuestionnaireVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "QuestionnaireVersion_status_effectiveFrom_idx" ON "QuestionnaireVersion"("status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "QuestionnaireVersion_publishedAt_idx" ON "QuestionnaireVersion"("publishedAt");

-- CreateIndex
CREATE INDEX "QuestionnaireQuestion_versionId_parentQuestionId_displayOrd_idx" ON "QuestionnaireQuestion"("versionId", "parentQuestionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireQuestion_versionId_questionKey_key" ON "QuestionnaireQuestion"("versionId", "questionKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireQuestion_versionId_displayOrder_key" ON "QuestionnaireQuestion"("versionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireQuestion_questionnaireQuestionId_versionId_key" ON "QuestionnaireQuestion"("questionnaireQuestionId", "versionId");

-- CreateIndex
CREATE INDEX "QuestionnaireOption_questionId_isActive_idx" ON "QuestionnaireOption"("questionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireOption_questionId_optionKey_key" ON "QuestionnaireOption"("questionId", "optionKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireOption_questionId_displayOrder_key" ON "QuestionnaireOption"("questionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireOption_optionId_questionId_key" ON "QuestionnaireOption"("optionId", "questionId");

-- CreateIndex
CREATE INDEX "DonorQuestionnaireSubmission_donorId_status_submittedAt_idx" ON "DonorQuestionnaireSubmission"("donorId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "DonorQuestionnaireSubmission_versionId_status_idx" ON "DonorQuestionnaireSubmission"("versionId", "status");

-- CreateIndex
CREATE INDEX "DonorQuestionnaireSubmission_submittedAt_idx" ON "DonorQuestionnaireSubmission"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DonorQuestionnaireSubmission_submissionId_donorId_key" ON "DonorQuestionnaireSubmission"("submissionId", "donorId");

-- CreateIndex
CREATE UNIQUE INDEX "DonorQuestionnaireSubmission_submissionId_versionId_key" ON "DonorQuestionnaireSubmission"("submissionId", "versionId");

-- CreateIndex
CREATE INDEX "QuestionnaireAnswer_submissionId_versionId_idx" ON "QuestionnaireAnswer"("submissionId", "versionId");

-- CreateIndex
CREATE INDEX "QuestionnaireAnswer_questionId_versionId_idx" ON "QuestionnaireAnswer"("questionId", "versionId");

-- CreateIndex
CREATE INDEX "QuestionnaireAnswer_answerOptionId_questionId_idx" ON "QuestionnaireAnswer"("answerOptionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireAnswer_submissionId_questionId_key" ON "QuestionnaireAnswer"("submissionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireReview_submissionId_key" ON "QuestionnaireReview"("submissionId");

-- CreateIndex
CREATE INDEX "QuestionnaireReview_reviewerStaffId_reviewedAt_idx" ON "QuestionnaireReview"("reviewerStaffId", "reviewedAt");

-- CreateIndex
CREATE INDEX "QuestionnaireReview_decision_reviewedAt_idx" ON "QuestionnaireReview"("decision", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireReview_submissionId_reviewId_key" ON "QuestionnaireReview"("submissionId", "reviewId");

-- CreateIndex
CREATE INDEX "QuestionnaireClinicalAssessment_submissionId_assessmentDate_idx" ON "QuestionnaireClinicalAssessment"("submissionId", "assessmentDate");

-- CreateIndex
CREATE INDEX "QuestionnaireClinicalAssessment_submissionId_donorId_idx" ON "QuestionnaireClinicalAssessment"("submissionId", "donorId");

-- CreateIndex
CREATE INDEX "QuestionnaireClinicalAssessment_reviewId_submissionId_idx" ON "QuestionnaireClinicalAssessment"("reviewId", "submissionId");

-- CreateIndex
CREATE INDEX "QuestionnaireClinicalAssessment_assessedByKnbtsStaffId_asse_idx" ON "QuestionnaireClinicalAssessment"("assessedByKnbtsStaffId", "assessmentDate");

-- CreateIndex
CREATE INDEX "QuestionnaireClinicalAssessment_appointmentId_donorId_idx" ON "QuestionnaireClinicalAssessment"("appointmentId", "donorId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireApproval_reviewId_key" ON "QuestionnaireApproval"("reviewId");

-- CreateIndex
CREATE INDEX "QuestionnaireApproval_submissionId_donorId_idx" ON "QuestionnaireApproval"("submissionId", "donorId");

-- CreateIndex
CREATE INDEX "QuestionnaireApproval_submissionId_reviewId_idx" ON "QuestionnaireApproval"("submissionId", "reviewId");

-- CreateIndex
CREATE INDEX "QuestionnaireApproval_donorId_status_expiresAt_idx" ON "QuestionnaireApproval"("donorId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "QuestionnaireApproval_expiresAt_status_idx" ON "QuestionnaireApproval"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireApproval_submissionId_reviewId_key" ON "QuestionnaireApproval"("submissionId", "reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireBookingAssociation_appointmentId_key" ON "QuestionnaireBookingAssociation"("appointmentId");

-- CreateIndex
CREATE INDEX "QuestionnaireBookingAssociation_approvalId_status_idx" ON "QuestionnaireBookingAssociation"("approvalId", "status");

-- CreateIndex
CREATE INDEX "QuestionnaireBookingAssociation_appointmentId_status_idx" ON "QuestionnaireBookingAssociation"("appointmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_appointmentId_donorId_key" ON "Appointment"("appointmentId", "donorId");

-- AddForeignKey
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuestionnaireVersion"("questionnaireVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "QuestionnaireQuestion"("questionnaireQuestionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireOption" ADD CONSTRAINT "QuestionnaireOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("questionnaireQuestionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorQuestionnaireSubmission" ADD CONSTRAINT "DonorQuestionnaireSubmission_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("donorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorQuestionnaireSubmission" ADD CONSTRAINT "DonorQuestionnaireSubmission_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuestionnaireVersion"("questionnaireVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireAnswer" ADD CONSTRAINT "QuestionnaireAnswer_submissionId_versionId_fkey" FOREIGN KEY ("submissionId", "versionId") REFERENCES "DonorQuestionnaireSubmission"("submissionId", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireAnswer" ADD CONSTRAINT "QuestionnaireAnswer_questionId_versionId_fkey" FOREIGN KEY ("questionId", "versionId") REFERENCES "QuestionnaireQuestion"("questionnaireQuestionId", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireAnswer" ADD CONSTRAINT "QuestionnaireAnswer_answerOptionId_questionId_fkey" FOREIGN KEY ("answerOptionId", "questionId") REFERENCES "QuestionnaireOption"("optionId", "questionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireReview" ADD CONSTRAINT "QuestionnaireReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DonorQuestionnaireSubmission"("submissionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireReview" ADD CONSTRAINT "QuestionnaireReview_reviewerStaffId_fkey" FOREIGN KEY ("reviewerStaffId") REFERENCES "KnbtsStaff"("knbtsStaffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireClinicalAssessment" ADD CONSTRAINT "QuestionnaireClinicalAssessment_submissionId_donorId_fkey" FOREIGN KEY ("submissionId", "donorId") REFERENCES "DonorQuestionnaireSubmission"("submissionId", "donorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireClinicalAssessment" ADD CONSTRAINT "QuestionnaireClinicalAssessment_assessedByKnbtsStaffId_fkey" FOREIGN KEY ("assessedByKnbtsStaffId") REFERENCES "KnbtsStaff"("knbtsStaffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireClinicalAssessment" ADD CONSTRAINT "QuestionnaireClinicalAssessment_submissionId_reviewId_fkey" FOREIGN KEY ("submissionId", "reviewId") REFERENCES "QuestionnaireReview"("submissionId", "reviewId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireClinicalAssessment" ADD CONSTRAINT "QuestionnaireClinicalAssessment_appointmentId_donorId_fkey" FOREIGN KEY ("appointmentId", "donorId") REFERENCES "Appointment"("appointmentId", "donorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireApproval" ADD CONSTRAINT "QuestionnaireApproval_submissionId_donorId_fkey" FOREIGN KEY ("submissionId", "donorId") REFERENCES "DonorQuestionnaireSubmission"("submissionId", "donorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireApproval" ADD CONSTRAINT "QuestionnaireApproval_submissionId_reviewId_fkey" FOREIGN KEY ("submissionId", "reviewId") REFERENCES "QuestionnaireReview"("submissionId", "reviewId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireApproval" ADD CONSTRAINT "QuestionnaireApproval_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("donorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireBookingAssociation" ADD CONSTRAINT "QuestionnaireBookingAssociation_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "QuestionnaireApproval"("approvalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireBookingAssociation" ADD CONSTRAINT "QuestionnaireBookingAssociation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("appointmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireSubmission_one_pending_per_donor_idx"
ON "DonorQuestionnaireSubmission" ("donorId")
WHERE "status" = 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireApproval_one_active_per_donor_idx"
ON "QuestionnaireApproval" ("donorId")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireBookingAssociation_one_active_per_approval_idx"
ON "QuestionnaireBookingAssociation" ("approvalId")
WHERE "status" = 'ACTIVE';

-- AddCheckConstraint
ALTER TABLE "QuestionnaireReview"
ADD CONSTRAINT "QuestionnaireReview_decline_reason_check"
CHECK (
    "decision" <> 'DECLINED'
    OR ("declineReason" IS NOT NULL AND BTRIM("declineReason") <> '')
);

-- AddCheckConstraint
ALTER TABLE "DonorQuestionnaireSubmission"
ADD CONSTRAINT "DonorQuestionnaireSubmission_status_submitted_at_check"
CHECK (
    "status" = 'DRAFT'
    OR "submittedAt" IS NOT NULL
);
