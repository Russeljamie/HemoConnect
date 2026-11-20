-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "slotId" INTEGER;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "locationVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "locationVerifiedByStaffId" INTEGER;

-- CreateTable
CREATE TABLE "AppointmentSlot" (
    "slotId" SERIAL NOT NULL,
    "slotDate" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hospitalId" INTEGER NOT NULL,
    "createdByStaffId" INTEGER NOT NULL,

    CONSTRAINT "AppointmentSlot_pkey" PRIMARY KEY ("slotId")
);

-- CreateIndex
CREATE INDEX "AppointmentSlot_hospitalId_slotDate_status_idx" ON "AppointmentSlot"("hospitalId", "slotDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentSlot_hospitalId_slotDate_time_key" ON "AppointmentSlot"("hospitalId", "slotDate", "time");

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_locationVerifiedByStaffId_fkey" FOREIGN KEY ("locationVerifiedByStaffId") REFERENCES "HospitalStaff"("staffId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSlot" ADD CONSTRAINT "AppointmentSlot_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("hospitalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSlot" ADD CONSTRAINT "AppointmentSlot_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "HospitalStaff"("staffId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("slotId") ON DELETE SET NULL ON UPDATE CASCADE;
