/*
  Warnings:

  - A unique constraint covering the columns `[learningPathId,scenarioWordId]` on the table `LearnerWordState` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[scenarioWordId,baseLanguage]` on the table `WordTranslation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ScenarioProgressStatus" AS ENUM ('LOCKED', 'ACTIVE', 'COMPLETED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'GENERATE_SCENARIO_LESSON';

-- AlterTable
ALTER TABLE "ComprehensionQuestion" ADD COLUMN     "comprehensionId" TEXT,
ALTER COLUMN "storyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LearnerWordState" ADD COLUMN     "fillGapCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mastered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pronunciationPassed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scenarioWordId" TEXT,
ALTER COLUMN "wordId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LearningPath" ADD COLUMN     "currentScenarioId" TEXT,
ADD COLUMN     "professionId" TEXT,
ADD COLUMN     "scenariosCompleted" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProfessionOption" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "ProfessionSubcategory" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "PronunciationAttempt" ADD COLUMN     "wordId" TEXT,
ALTER COLUMN "exerciseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WordTranslation" ADD COLUMN     "scenarioWordId" TEXT,
ALTER COLUMN "wordId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProfessionScenario" (
    "id" TEXT NOT NULL,
    "professionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioLesson" (
    "id" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "scenarioPosition" INTEGER NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioWord" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "ipa" TEXT,
    "complexityLevel" "DifficultyBand" NOT NULL,
    "examplePhrases" JSONB,
    "exampleSentences" JSONB,
    "tags" JSONB,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordAudioCache" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordAudioCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioComprehension" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioComprehension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerScenarioProgress" (
    "id" TEXT NOT NULL,
    "learningPathId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" "ScenarioProgressStatus" NOT NULL DEFAULT 'LOCKED',
    "wordsCompleted" INTEGER NOT NULL DEFAULT 0,
    "comprehensionPassed" BOOLEAN NOT NULL DEFAULT false,
    "comprehensionScore" DECIMAL(4,2),
    "timesCompleted" INTEGER NOT NULL DEFAULT 0,
    "bestCompScore" DECIMAL(4,2),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "unlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerScenarioProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionScenario_professionId_position_key" ON "ProfessionScenario"("professionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionScenario_professionId_slug_key" ON "ProfessionScenario"("professionId", "slug");

-- CreateIndex
CREATE INDEX "ScenarioLesson_subcategoryId_language_status_idx" ON "ScenarioLesson"("subcategoryId", "language", "status");

-- CreateIndex
CREATE INDEX "ScenarioLesson_subcategoryId_language_scenarioPosition_idx" ON "ScenarioLesson"("subcategoryId", "language", "scenarioPosition");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioLesson_subcategoryId_scenarioId_language_key" ON "ScenarioLesson"("subcategoryId", "scenarioId", "language");

-- CreateIndex
CREATE INDEX "ScenarioWord_lessonId_idx" ON "ScenarioWord"("lessonId");

-- CreateIndex
CREATE INDEX "ScenarioWord_word_idx" ON "ScenarioWord"("word");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioWord_lessonId_position_key" ON "ScenarioWord"("lessonId", "position");

-- CreateIndex
CREATE INDEX "WordAudioCache_wordId_idx" ON "WordAudioCache"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "WordAudioCache_wordId_language_key" ON "WordAudioCache"("wordId", "language");

-- CreateIndex
CREATE INDEX "ScenarioComprehension_lessonId_idx" ON "ScenarioComprehension"("lessonId");

-- CreateIndex
CREATE INDEX "ScenarioComprehension_position_idx" ON "ScenarioComprehension"("position");

-- CreateIndex
CREATE INDEX "LearnerScenarioProgress_learningPathId_status_idx" ON "LearnerScenarioProgress"("learningPathId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerScenarioProgress_learningPathId_lessonId_key" ON "LearnerScenarioProgress"("learningPathId", "lessonId");

-- CreateIndex
CREATE INDEX "ComprehensionQuestion_comprehensionId_idx" ON "ComprehensionQuestion"("comprehensionId");

-- CreateIndex
CREATE INDEX "LearnerWordState_scenarioWordId_idx" ON "LearnerWordState"("scenarioWordId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerWordState_learningPathId_scenarioWordId_key" ON "LearnerWordState"("learningPathId", "scenarioWordId");

-- CreateIndex
CREATE INDEX "LearningPath_professionId_idx" ON "LearningPath"("professionId");

-- CreateIndex
CREATE INDEX "LearningPath_currentScenarioId_idx" ON "LearningPath"("currentScenarioId");

-- CreateIndex
CREATE INDEX "ProfessionSubcategory_professionId_slug_idx" ON "ProfessionSubcategory"("professionId", "slug");

-- CreateIndex
CREATE INDEX "PronunciationAttempt_wordId_idx" ON "PronunciationAttempt"("wordId");

-- CreateIndex
CREATE INDEX "WordTranslation_scenarioWordId_idx" ON "WordTranslation"("scenarioWordId");

-- CreateIndex
CREATE UNIQUE INDEX "WordTranslation_scenarioWordId_baseLanguage_key" ON "WordTranslation"("scenarioWordId", "baseLanguage");

-- AddForeignKey
ALTER TABLE "ProfessionScenario" ADD CONSTRAINT "ProfessionScenario_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "ProfessionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPath" ADD CONSTRAINT "LearningPath_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "ProfessionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPath" ADD CONSTRAINT "LearningPath_currentScenarioId_fkey" FOREIGN KEY ("currentScenarioId") REFERENCES "ProfessionScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLesson" ADD CONSTRAINT "ScenarioLesson_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ProfessionSubcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLesson" ADD CONSTRAINT "ScenarioLesson_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ProfessionScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioWord" ADD CONSTRAINT "ScenarioWord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ScenarioLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordAudioCache" ADD CONSTRAINT "WordAudioCache_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "ScenarioWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComprehension" ADD CONSTRAINT "ScenarioComprehension_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ScenarioLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerScenarioProgress" ADD CONSTRAINT "LearnerScenarioProgress_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerScenarioProgress" ADD CONSTRAINT "LearnerScenarioProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ScenarioLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordTranslation" ADD CONSTRAINT "WordTranslation_scenarioWordId_fkey" FOREIGN KEY ("scenarioWordId") REFERENCES "ScenarioWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerWordState" ADD CONSTRAINT "LearnerWordState_scenarioWordId_fkey" FOREIGN KEY ("scenarioWordId") REFERENCES "ScenarioWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprehensionQuestion" ADD CONSTRAINT "ComprehensionQuestion_comprehensionId_fkey" FOREIGN KEY ("comprehensionId") REFERENCES "ScenarioComprehension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciationAttempt" ADD CONSTRAINT "PronunciationAttempt_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "ScenarioWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
