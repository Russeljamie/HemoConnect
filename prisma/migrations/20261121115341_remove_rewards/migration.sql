/*
  Warnings:

  - You are about to drop the column `points` on the `Donor` table. All the data in the column will be lost.
  - You are about to drop the `RewardTransaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RewardTransaction" DROP CONSTRAINT "RewardTransaction_donationId_fkey";

-- DropForeignKey
ALTER TABLE "RewardTransaction" DROP CONSTRAINT "RewardTransaction_donorId_fkey";

-- AlterTable
ALTER TABLE "Donor" DROP COLUMN "points";

-- DropTable
DROP TABLE "RewardTransaction";
