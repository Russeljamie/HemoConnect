-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "campaignId" INTEGER;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE SET NULL ON UPDATE CASCADE;
