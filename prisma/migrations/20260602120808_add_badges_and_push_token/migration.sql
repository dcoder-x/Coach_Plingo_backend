-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BADGE_EARNED';
ALTER TYPE "NotificationType" ADD VALUE 'STREAK_MILESTONE';

-- AlterTable
ALTER TABLE "Learner" ADD COLUMN     "pushToken" TEXT;

-- CreateTable
CREATE TABLE "LearnerBadge" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "badgeKey" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnerBadge_learnerId_idx" ON "LearnerBadge"("learnerId");

-- CreateIndex
CREATE INDEX "LearnerBadge_earnedAt_idx" ON "LearnerBadge"("earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerBadge_learnerId_badgeKey_key" ON "LearnerBadge"("learnerId", "badgeKey");

-- AddForeignKey
ALTER TABLE "LearnerBadge" ADD CONSTRAINT "LearnerBadge_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
