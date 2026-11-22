-- Data cleanup: remove NGO users and notifications connected to removed features.
DELETE FROM "Notification" AS n
WHERE n."campaignId" IS NOT NULL
   OR EXISTS (
     SELECT 1
     FROM "User" AS u
     WHERE u."userId" = n."userId"
       AND u."role" = 'NGO'
   );

DELETE FROM "User"
WHERE "role" = 'NGO';

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_createdByNgoUserId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_hospitalNeedId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_ngoId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignRegistration" DROP CONSTRAINT "CampaignRegistration_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignRegistration" DROP CONSTRAINT "CampaignRegistration_donorId_fkey";

-- DropForeignKey
ALTER TABLE "HospitalDonationNeed" DROP CONSTRAINT "HospitalDonationNeed_createdByStaffId_fkey";

-- DropForeignKey
ALTER TABLE "HospitalDonationNeed" DROP CONSTRAINT "HospitalDonationNeed_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "NGOUser" DROP CONSTRAINT "NGOUser_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "NGOUser" DROP CONSTRAINT "NGOUser_ngoId_fkey";

-- DropForeignKey
ALTER TABLE "NGOUser" DROP CONSTRAINT "NGOUser_userId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "OutreachActivity" DROP CONSTRAINT "OutreachActivity_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "OutreachActivity" DROP CONSTRAINT "OutreachActivity_createdByNgoUserId_fkey";

-- DropForeignKey
ALTER TABLE "OutreachActivity" DROP CONSTRAINT "OutreachActivity_ngoId_fkey";

-- DropForeignKey
ALTER TABLE "_HospitalNGOCollaboration" DROP CONSTRAINT "_HospitalNGOCollaboration_A_fkey";

-- DropForeignKey
ALTER TABLE "_HospitalNGOCollaboration" DROP CONSTRAINT "_HospitalNGOCollaboration_B_fkey";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "campaignId";

-- DropTable
DROP TABLE "Campaign";

-- DropTable
DROP TABLE "CampaignRegistration";

-- DropTable
DROP TABLE "HospitalDonationNeed";

-- DropTable
DROP TABLE "NGO";

-- DropTable
DROP TABLE "NGOUser";

-- DropTable
DROP TABLE "OutreachActivity";

-- DropTable
DROP TABLE "_HospitalNGOCollaboration";
