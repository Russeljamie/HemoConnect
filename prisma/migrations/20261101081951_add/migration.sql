-- AlterTable
ALTER TABLE "EmergencyRequest" ADD COLUMN     "currentWave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAlertAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RequestMatch" ADD COLUMN     "wave" INTEGER NOT NULL DEFAULT 1;
