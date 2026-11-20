-- CreateTable
CREATE TABLE "CampaignRegistration" (
    "registrationId" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "donorId" INTEGER NOT NULL,
    "campaignId" INTEGER NOT NULL,

    CONSTRAINT "CampaignRegistration_pkey" PRIMARY KEY ("registrationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRegistration_campaignId_donorId_key" ON "CampaignRegistration"("campaignId", "donorId");

-- AddForeignKey
ALTER TABLE "CampaignRegistration" ADD CONSTRAINT "CampaignRegistration_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("donorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRegistration" ADD CONSTRAINT "CampaignRegistration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;
