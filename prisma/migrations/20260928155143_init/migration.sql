-- CreateTable
CREATE TABLE "User" (
    "userId" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Admin" (
    "adminId" SERIAL NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("adminId")
);

-- CreateTable
CREATE TABLE "Donor" (
    "donorId" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "bloodType" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "donationFrequency" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("donorId")
);

-- CreateTable
CREATE TABLE "Patient" (
    "patientId" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "bloodType" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "gender" TEXT NOT NULL,
    "hospitalId" INTEGER NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("patientId")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "hospitalId" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("hospitalId")
);

-- CreateTable
CREATE TABLE "NGO" (
    "ngoId" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,

    CONSTRAINT "NGO_pkey" PRIMARY KEY ("ngoId")
);

-- CreateTable
CREATE TABLE "NGOUser" (
    "ngoUserId" SERIAL NOT NULL,
    "ngoId" INTEGER NOT NULL,
    "createdByAdminId" INTEGER NOT NULL,

    CONSTRAINT "NGOUser_pkey" PRIMARY KEY ("ngoUserId")
);

-- CreateTable
CREATE TABLE "HospitalStaff" (
    "staffId" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,

    CONSTRAINT "HospitalStaff_pkey" PRIMARY KEY ("staffId")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "appointmentId" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "donorId" INTEGER,
    "patientId" INTEGER,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("appointmentId")
);

-- CreateTable
CREATE TABLE "DonationRecord" (
    "donationId" SERIAL NOT NULL,
    "donationDate" TIMESTAMP(3) NOT NULL,
    "bloodType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "donorId" INTEGER NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "staffId" INTEGER NOT NULL,

    CONSTRAINT "DonationRecord_pkey" PRIMARY KEY ("donationId")
);

-- CreateTable
CREATE TABLE "RewardTransaction" (
    "rewardId" SERIAL NOT NULL,
    "pointsEarned" INTEGER NOT NULL,
    "awardDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "donationId" INTEGER NOT NULL,

    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("rewardId")
);

-- CreateTable
CREATE TABLE "EmergencyRequest" (
    "requestId" SERIAL NOT NULL,
    "bloodType" TEXT NOT NULL,
    "quantityRequired" INTEGER NOT NULL,
    "urgencyLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "neededBy" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,

    CONSTRAINT "EmergencyRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "Alert" (
    "alertId" SERIAL NOT NULL,
    "alertType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "requestId" INTEGER NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("alertId")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "campaignId" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdByAdminId" INTEGER NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("campaignId")
);

-- CreateTable
CREATE TABLE "_HospitalNGOCollaboration" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_HospitalNGOCollaboration_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NGOUserEngagesStaff" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_NGOUserEngagesStaff_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DonationFulfillsRequests" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_DonationFulfillsRequests_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "_HospitalNGOCollaboration_B_index" ON "_HospitalNGOCollaboration"("B");

-- CreateIndex
CREATE INDEX "_NGOUserEngagesStaff_B_index" ON "_NGOUserEngagesStaff"("B");

-- CreateIndex
CREATE INDEX "_DonationFulfillsRequests_B_index" ON "_DonationFulfillsRequests"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("adminId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("hospitalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NGOUser" ADD CONSTRAINT "NGOUser_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "NGO"("ngoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NGOUser" ADD CONSTRAINT "NGOUser_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("adminId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("hospitalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("donorId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("patientId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationRecord" ADD CONSTRAINT "DonationRecord_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("donorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationRecord" ADD CONSTRAINT "DonationRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("appointmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationRecord" ADD CONSTRAINT "DonationRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HospitalStaff"("staffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "DonationRecord"("donationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyRequest" ADD CONSTRAINT "EmergencyRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EmergencyRequest"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("adminId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HospitalNGOCollaboration" ADD CONSTRAINT "_HospitalNGOCollaboration_A_fkey" FOREIGN KEY ("A") REFERENCES "Hospital"("hospitalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HospitalNGOCollaboration" ADD CONSTRAINT "_HospitalNGOCollaboration_B_fkey" FOREIGN KEY ("B") REFERENCES "NGO"("ngoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NGOUserEngagesStaff" ADD CONSTRAINT "_NGOUserEngagesStaff_A_fkey" FOREIGN KEY ("A") REFERENCES "HospitalStaff"("staffId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NGOUserEngagesStaff" ADD CONSTRAINT "_NGOUserEngagesStaff_B_fkey" FOREIGN KEY ("B") REFERENCES "NGOUser"("ngoUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DonationFulfillsRequests" ADD CONSTRAINT "_DonationFulfillsRequests_A_fkey" FOREIGN KEY ("A") REFERENCES "DonationRecord"("donationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DonationFulfillsRequests" ADD CONSTRAINT "_DonationFulfillsRequests_B_fkey" FOREIGN KEY ("B") REFERENCES "EmergencyRequest"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;
