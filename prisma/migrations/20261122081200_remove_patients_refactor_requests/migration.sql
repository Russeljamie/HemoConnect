UPDATE "EmergencyRequest"
SET "patientId" = NULL
WHERE "patientId" IS NOT NULL;

UPDATE "Appointment"
SET "patientId" = NULL
WHERE "patientId" IS NOT NULL;

UPDATE "AuditLog"
SET "actorUserId" = NULL
WHERE "actorUserId" IN (
    SELECT "userId"
    FROM "User"
    WHERE "role" = 'PATIENT'
);

DELETE FROM "Notification"
WHERE "userId" IN (
    SELECT "userId"
    FROM "User"
    WHERE "role" = 'PATIENT'
);

DELETE FROM "PasswordResetToken"
WHERE "userId" IN (
    SELECT "userId"
    FROM "User"
    WHERE "role" = 'PATIENT'
);

DELETE FROM "User"
WHERE "role" = 'PATIENT';

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_patientId_fkey";

-- DropForeignKey
ALTER TABLE "AssistanceEnquiry" DROP CONSTRAINT "AssistanceEnquiry_patientId_fkey";

-- DropForeignKey
ALTER TABLE "AssistanceEnquiry" DROP CONSTRAINT "AssistanceEnquiry_preferredHospitalId_fkey";

-- DropForeignKey
ALTER TABLE "AssistanceEnquiry" DROP CONSTRAINT "AssistanceEnquiry_resultingRequestId_fkey";

-- DropForeignKey
ALTER TABLE "AssistanceEnquiry" DROP CONSTRAINT "AssistanceEnquiry_reviewedByStaffId_fkey";

-- DropForeignKey
ALTER TABLE "AssistanceEnquiry" DROP CONSTRAINT "AssistanceEnquiry_submittingUserId_fkey";

-- DropForeignKey
ALTER TABLE "EmergencyRequest" DROP CONSTRAINT "EmergencyRequest_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_userId_fkey";

-- DropForeignKey
ALTER TABLE "PatientAccess" DROP CONSTRAINT "PatientAccess_grantedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PatientAccess" DROP CONSTRAINT "PatientAccess_patientId_fkey";

-- DropForeignKey
ALTER TABLE "PatientAccess" DROP CONSTRAINT "PatientAccess_userId_fkey";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "patientId";

-- AlterTable
ALTER TABLE "EmergencyRequest" DROP COLUMN "patientId",
ADD COLUMN     "patientReference" VARCHAR(60);

-- DropTable
DROP TABLE "AssistanceEnquiry";

-- DropTable
DROP TABLE "Patient";

-- DropTable
DROP TABLE "PatientAccess";
