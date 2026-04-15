-- AlterEnum
ALTER TYPE "LearningPathStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- AlterTable
ALTER TABLE "LearningPath"
ADD COLUMN "currentSubcategoryId" TEXT,
ADD COLUMN "subcategoriesCompleted" INTEGER NOT NULL DEFAULT 0;

-- Drop old uniqueness so archived/completed paths can coexist
DROP INDEX IF EXISTS "LearningPath_learnerId_language_profession_key";

-- CreateEnum
CREATE TYPE "SubcategoryStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "ProfessionSubcategory" (
    "id" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "wordAllocation" INTEGER NOT NULL DEFAULT 100,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcategoryProgress" (
    "id" TEXT NOT NULL,
    "learningPathId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "status" "SubcategoryStatus" NOT NULL DEFAULT 'PENDING',
    "wordsCompleted" INTEGER NOT NULL DEFAULT 0,
    "wordsTotal" INTEGER NOT NULL DEFAULT 0,
    "milestonesCompleted" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SubcategoryProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerStreak" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" DATE,
    "streakAtRisk" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerStreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionSubcategory_profession_language_idx" ON "ProfessionSubcategory"("profession", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionSubcategory_profession_language_position_key" ON "ProfessionSubcategory"("profession", "language", "position");

-- CreateIndex
CREATE INDEX "SubcategoryProgress_learningPathId_status_idx" ON "SubcategoryProgress"("learningPathId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubcategoryProgress_learningPathId_subcategoryId_key" ON "SubcategoryProgress"("learningPathId", "subcategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerStreak_learnerId_key" ON "LearnerStreak"("learnerId");

-- CreateIndex
CREATE INDEX "LearningPath_currentSubcategoryId_idx" ON "LearningPath"("currentSubcategoryId");

-- Normalize existing data: allow only one ACTIVE path per learner before creating partial unique index
WITH ranked_active_paths AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "learnerId"
            ORDER BY "updatedAt" DESC, "createdAt" DESC
        ) AS rn
    FROM "LearningPath"
    WHERE "status" = 'ACTIVE'
)
UPDATE "LearningPath" lp
SET
    "status" = 'COMPLETED',
    "completedAt" = COALESCE(lp."completedAt", CURRENT_TIMESTAMP)
FROM ranked_active_paths rap
WHERE lp."id" = rap."id"
  AND rap.rn > 1;

-- Safety net for one active path per learner
CREATE UNIQUE INDEX "idx_one_active_path_per_learner"
ON "LearningPath" ("learnerId")
WHERE "status" = 'ACTIVE';

-- For GET /learning/paths?status=active lookup
CREATE INDEX "idx_learning_path_learner_status"
ON "LearningPath" ("learnerId", "status");

-- AddForeignKey
ALTER TABLE "LearningPath"
ADD CONSTRAINT "LearningPath_currentSubcategoryId_fkey"
FOREIGN KEY ("currentSubcategoryId") REFERENCES "ProfessionSubcategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcategoryProgress"
ADD CONSTRAINT "SubcategoryProgress_learningPathId_fkey"
FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcategoryProgress"
ADD CONSTRAINT "SubcategoryProgress_subcategoryId_fkey"
FOREIGN KEY ("subcategoryId") REFERENCES "ProfessionSubcategory"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerStreak"
ADD CONSTRAINT "LearnerStreak_learnerId_fkey"
FOREIGN KEY ("learnerId") REFERENCES "Learner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
