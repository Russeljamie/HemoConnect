-- Create hospital-specific operational settings for stock recommendations.
CREATE TABLE "HospitalStockSettings" (
    "settingsId" SERIAL NOT NULL,
    "historicalWindowDays" INTEGER NOT NULL DEFAULT 30,
    "replenishmentLeadTimeDays" INTEGER,
    "safetyBufferDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hospitalId" INTEGER NOT NULL,

    CONSTRAINT "HospitalStockSettings_pkey" PRIMARY KEY ("settingsId")
);

CREATE UNIQUE INDEX "HospitalStockSettings_hospitalId_key"
    ON "HospitalStockSettings"("hospitalId");

ALTER TABLE "HospitalStockSettings"
    ADD CONSTRAINT "HospitalStockSettings_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("hospitalId")
    ON DELETE CASCADE ON UPDATE CASCADE;
