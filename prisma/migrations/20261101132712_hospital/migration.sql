-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_userId_fkey";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "hospitalNeedId" INTEGER;

-- AlterTable
ALTER TABLE "EmergencyRequest" ADD COLUMN     "createdByStaffId" INTEGER,
ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "fulfilledQuantity" INTEGER,
ADD COLUMN     "outcomeNotes" TEXT;

-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PatientAccess" (
    "accessId" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "relationship" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "grantedByUserId" INTEGER,

    CONSTRAINT "PatientAccess_pkey" PRIMARY KEY ("accessId")
);

-- CreateTable
CREATE TABLE "AssistanceEnquiry" (
    "enquiryId" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_HOSPITAL_VERIFICATION',
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "submitterPhone" TEXT,
    "requestedBloodType" TEXT,
    "quantityRequired" INTEGER,
    "urgencyLevel" TEXT,
    "neededBy" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "submittingUserId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "preferredHospitalId" INTEGER,
    "reviewedByStaffId" INTEGER,
    "resultingRequestId" INTEGER,

    CONSTRAINT "AssistanceEnquiry_pkey" PRIMARY KEY ("enquiryId")
);

-- CreateTable
CREATE TABLE "HospitalDonationNeed" (
    "needId" SERIAL NOT NULL,
    "bloodType" TEXT NOT NULL,
    "unitsNeeded" INTEGER NOT NULL,
    "neededBy" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hospitalId" INTEGER NOT NULL,
    "createdByStaffId" INTEGER NOT NULL,

    CONSTRAINT "HospitalDonationNeed_pkey" PRIMARY KEY ("needId")
);

-- CreateIndex
CREATE INDEX "PatientAccess_userId_status_idx" ON "PatientAccess"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccess_patientId_userId_key" ON "PatientAccess"("patientId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceEnquiry_resultingRequestId_key" ON "AssistanceEnquiry"("resultingRequestId");

-- CreateIndex
CREATE INDEX "AssistanceEnquiry_status_preferredHospitalId_createdAt_idx" ON "AssistanceEnquiry"("status", "preferredHospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalDonationNeed_hospitalId_status_neededBy_idx" ON "HospitalDonationNeed"("hospitalId", "status", "neededBy");

-- CreateIndex
CREATE INDEX "EmergencyRequest_hospitalId_status_neededBy_idx" ON "EmergencyRequest"("hospitalId", "status", "neededBy");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyRequest" ADD CONSTRAINT "EmergencyRequest_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "HospitalStaff"("staffId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccess" ADD CONSTRAINT "PatientAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("patientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccess" ADD CONSTRAINT "PatientAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccess" ADD CONSTRAINT "PatientAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceEnquiry" ADD CONSTRAINT "AssistanceEnquiry_submittingUserId_fkey" FOREIGN KEY ("submittingUserId") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceEnquiry" ADD CONSTRAINT "AssistanceEnquiry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceEnquiry" ADD CONSTRAINT "AssistanceEnquiry_preferredHospitalId_fkey" FOREIGN KEY ("preferredHospitalId") REFERENCES "Hospital"("hospitalId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceEnquiry" ADD CONSTRAINT "AssistanceEnquiry_reviewedByStaffId_fkey" FOREIGN KEY ("reviewedByStaffId") REFERENCES "HospitalStaff"("staffId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceEnquiry" ADD CONSTRAINT "AssistanceEnquiry_resultingRequestId_fkey" FOREIGN KEY ("resultingRequestId") REFERENCES "EmergencyRequest"("requestId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDonationNeed" ADD CONSTRAINT "HospitalDonationNeed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("hospitalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDonationNeed" ADD CONSTRAINT "HospitalDonationNeed_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "HospitalStaff"("staffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_hospitalNeedId_fkey" FOREIGN KEY ("hospitalNeedId") REFERENCES "HospitalDonationNeed"("needId") ON DELETE SET NULL ON UPDATE CASCADE;
