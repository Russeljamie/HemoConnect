-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('HOSPITAL', 'KNBTS_CENTRE');

-- AlterTable
ALTER TABLE "DonationRecord" ADD COLUMN     "recordedByKnbtsStaffId" INTEGER;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "institutionType" "InstitutionType" NOT NULL DEFAULT 'HOSPITAL';

-- AlterTable
ALTER TABLE "MedicalCheckup" ADD COLUMN     "recordedByKnbtsStaffId" INTEGER;

-- CreateTable
CREATE TABLE "KnbtsStaff" (
    "knbtsStaffId" SERIAL NOT NULL,
    "designation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "centreId" INTEGER NOT NULL,

    CONSTRAINT "KnbtsStaff_pkey" PRIMARY KEY ("knbtsStaffId")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnbtsStaff_userId_key" ON "KnbtsStaff"("userId");

-- AddForeignKey
ALTER TABLE "KnbtsStaff" ADD CONSTRAINT "KnbtsStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnbtsStaff" ADD CONSTRAINT "KnbtsStaff_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Hospital"("hospitalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationRecord" ADD CONSTRAINT "DonationRecord_recordedByKnbtsStaffId_fkey" FOREIGN KEY ("recordedByKnbtsStaffId") REFERENCES "KnbtsStaff"("knbtsStaffId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCheckup" ADD CONSTRAINT "MedicalCheckup_recordedByKnbtsStaffId_fkey" FOREIGN KEY ("recordedByKnbtsStaffId") REFERENCES "KnbtsStaff"("knbtsStaffId") ON DELETE SET NULL ON UPDATE CASCADE;
