-- AlterTable
ALTER TABLE "LearnerScenarioProgress" ADD COLUMN     "lessonMastered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wordMasteryLevel" DECIMAL(5,2) NOT NULL DEFAULT 0.00;
