-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "createdByNgoUserId" INTEGER,
ALTER COLUMN "createdByAdminId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdByNgoUserId_fkey" FOREIGN KEY ("createdByNgoUserId") REFERENCES "NGOUser"("ngoUserId") ON DELETE SET NULL ON UPDATE CASCADE;
