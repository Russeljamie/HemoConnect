-- CreateTable
CREATE TABLE "OutreachActivity" (
    "activityId" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "peopleReached" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ngoId" INTEGER NOT NULL,
    "campaignId" INTEGER,
    "createdByNgoUserId" INTEGER,

    CONSTRAINT "OutreachActivity_pkey" PRIMARY KEY ("activityId")
);

-- CreateIndex
CREATE INDEX "OutreachActivity_ngoId_scheduledAt_idx" ON "OutreachActivity"("ngoId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "OutreachActivity" ADD CONSTRAINT "OutreachActivity_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "NGO"("ngoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachActivity" ADD CONSTRAINT "OutreachActivity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachActivity" ADD CONSTRAINT "OutreachActivity_createdByNgoUserId_fkey" FOREIGN KEY ("createdByNgoUserId") REFERENCES "NGOUser"("ngoUserId") ON DELETE SET NULL ON UPDATE CASCADE;
