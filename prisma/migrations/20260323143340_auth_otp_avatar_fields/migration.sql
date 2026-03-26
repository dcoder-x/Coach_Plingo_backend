-- CreateEnum
CREATE TYPE "LearningPathStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('VOCABULARY_SPRINT', 'COMPREHENSION', 'PRONUNCIATION_MASTERY');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DifficultyBand" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "WordStatus" AS ENUM ('ACTIVE', 'LOCKED', 'MASTERED');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('GENERATED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'SHORT_ANSWER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MILESTONE_COMPLETED', 'WORD_MASTERED', 'LESSON_AVAILABLE', 'DAILY_REMINDER', 'ACHIEVEMENT', 'ERROR');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATE_LESSON', 'GENERATE_STORY', 'GENERATE_EXERCISES', 'GENERATE_AUDIO', 'SCORE_PRONUNCIATION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Learner" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "oauthProvider" TEXT,
    "oauthId" TEXT,
    "baseLanguage" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "location" TEXT,
    "avatarUrl" TEXT,
    "avatarPublicId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailOtp" TEXT,
    "emailOtpExpiry" TIMESTAMP(3),
    "passwordResetOtp" TEXT,
    "passwordResetOtpExpiry" TIMESTAMP(3),
    "profileComplete" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Learner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPath" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "status" "LearningPathStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentMilestone" INTEGER NOT NULL DEFAULT 1,
    "wordsPerLesson" INTEGER NOT NULL DEFAULT 20,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "learningPathId" TEXT NOT NULL,
    "milestoneNumber" INTEGER NOT NULL,
    "type" "MilestoneType" NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "generatedWords" JSONB,
    "unlockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalVocabularySet" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "difficultyBand" "DifficultyBand" NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalVocabularySet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalVocabularyWord" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "complexityLevel" "DifficultyBand" NOT NULL,
    "examplePhrases" JSONB,
    "exampleSentences" JSONB,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalVocabularyWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordTranslation" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "baseLanguage" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyAudioCache" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "ipa" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyAudioCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerWordState" (
    "id" TEXT NOT NULL,
    "learningPathId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "status" "WordStatus" NOT NULL DEFAULT 'LOCKED',
    "masteryScore" DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    "meaningSeen" BOOLEAN NOT NULL DEFAULT false,
    "usageCompleted" BOOLEAN NOT NULL DEFAULT false,
    "pronunciationScore" DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerWordState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vocabularyCoverage" JSONB,
    "status" "StoryStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprehensionQuestion" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswer" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComprehensionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprehensionResponse" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComprehensionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PronunciationExercise" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "referenceAudioUrl" TEXT NOT NULL,
    "complexityLevel" "DifficultyBand" NOT NULL,
    "position" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PronunciationExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PronunciationAttempt" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "recordedAudioUrl" TEXT NOT NULL,
    "accuracyScore" DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PronunciationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsyncJob" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "learnerId" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "currentRetry" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "attemptedAt" TIMESTAMP(3)[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Learner_email_key" ON "Learner"("email");

-- CreateIndex
CREATE INDEX "Learner_email_idx" ON "Learner"("email");

-- CreateIndex
CREATE INDEX "Learner_oauthProvider_oauthId_idx" ON "Learner"("oauthProvider", "oauthId");

-- CreateIndex
CREATE INDEX "LearningPath_learnerId_idx" ON "LearningPath"("learnerId");

-- CreateIndex
CREATE INDEX "LearningPath_status_idx" ON "LearningPath"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPath_learnerId_language_profession_key" ON "LearningPath"("learnerId", "language", "profession");

-- CreateIndex
CREATE INDEX "Milestone_learningPathId_idx" ON "Milestone"("learningPathId");

-- CreateIndex
CREATE INDEX "Milestone_status_idx" ON "Milestone"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_learningPathId_milestoneNumber_key" ON "Milestone"("learningPathId", "milestoneNumber");

-- CreateIndex
CREATE INDEX "GlobalVocabularySet_language_profession_idx" ON "GlobalVocabularySet"("language", "profession");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalVocabularySet_language_profession_difficultyBand_key" ON "GlobalVocabularySet"("language", "profession", "difficultyBand");

-- CreateIndex
CREATE INDEX "GlobalVocabularyWord_setId_idx" ON "GlobalVocabularyWord"("setId");

-- CreateIndex
CREATE INDEX "GlobalVocabularyWord_complexityLevel_idx" ON "GlobalVocabularyWord"("complexityLevel");

-- CreateIndex
CREATE INDEX "GlobalVocabularyWord_word_idx" ON "GlobalVocabularyWord"("word");

-- CreateIndex
CREATE INDEX "WordTranslation_wordId_idx" ON "WordTranslation"("wordId");

-- CreateIndex
CREATE INDEX "WordTranslation_baseLanguage_idx" ON "WordTranslation"("baseLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "WordTranslation_wordId_baseLanguage_key" ON "WordTranslation"("wordId", "baseLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyAudioCache_wordId_key" ON "VocabularyAudioCache"("wordId");

-- CreateIndex
CREATE INDEX "VocabularyAudioCache_wordId_idx" ON "VocabularyAudioCache"("wordId");

-- CreateIndex
CREATE INDEX "LearnerWordState_learningPathId_idx" ON "LearnerWordState"("learningPathId");

-- CreateIndex
CREATE INDEX "LearnerWordState_wordId_idx" ON "LearnerWordState"("wordId");

-- CreateIndex
CREATE INDEX "LearnerWordState_status_idx" ON "LearnerWordState"("status");

-- CreateIndex
CREATE INDEX "LearnerWordState_masteryScore_idx" ON "LearnerWordState"("masteryScore");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerWordState_learningPathId_wordId_key" ON "LearnerWordState"("learningPathId", "wordId");

-- CreateIndex
CREATE INDEX "Story_milestoneId_idx" ON "Story"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Story_milestoneId_key" ON "Story"("milestoneId");

-- CreateIndex
CREATE INDEX "ComprehensionQuestion_storyId_idx" ON "ComprehensionQuestion"("storyId");

-- CreateIndex
CREATE INDEX "ComprehensionQuestion_position_idx" ON "ComprehensionQuestion"("position");

-- CreateIndex
CREATE INDEX "ComprehensionResponse_questionId_idx" ON "ComprehensionResponse"("questionId");

-- CreateIndex
CREATE INDEX "ComprehensionResponse_learnerId_idx" ON "ComprehensionResponse"("learnerId");

-- CreateIndex
CREATE INDEX "PronunciationExercise_milestoneId_idx" ON "PronunciationExercise"("milestoneId");

-- CreateIndex
CREATE INDEX "PronunciationExercise_position_idx" ON "PronunciationExercise"("position");

-- CreateIndex
CREATE INDEX "PronunciationAttempt_exerciseId_idx" ON "PronunciationAttempt"("exerciseId");

-- CreateIndex
CREATE INDEX "PronunciationAttempt_learnerId_idx" ON "PronunciationAttempt"("learnerId");

-- CreateIndex
CREATE INDEX "Notification_learnerId_idx" ON "Notification"("learnerId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "AsyncJob_type_idx" ON "AsyncJob"("type");

-- CreateIndex
CREATE INDEX "AsyncJob_status_idx" ON "AsyncJob"("status");

-- CreateIndex
CREATE INDEX "AsyncJob_learnerId_idx" ON "AsyncJob"("learnerId");

-- AddForeignKey
ALTER TABLE "LearningPath" ADD CONSTRAINT "LearningPath_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalVocabularyWord" ADD CONSTRAINT "GlobalVocabularyWord_setId_fkey" FOREIGN KEY ("setId") REFERENCES "GlobalVocabularySet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordTranslation" ADD CONSTRAINT "WordTranslation_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GlobalVocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyAudioCache" ADD CONSTRAINT "VocabularyAudioCache_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GlobalVocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerWordState" ADD CONSTRAINT "LearnerWordState_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerWordState" ADD CONSTRAINT "LearnerWordState_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GlobalVocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprehensionQuestion" ADD CONSTRAINT "ComprehensionQuestion_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprehensionResponse" ADD CONSTRAINT "ComprehensionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ComprehensionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprehensionResponse" ADD CONSTRAINT "ComprehensionResponse_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciationExercise" ADD CONSTRAINT "PronunciationExercise_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciationAttempt" ADD CONSTRAINT "PronunciationAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "PronunciationExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciationAttempt" ADD CONSTRAINT "PronunciationAttempt_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
