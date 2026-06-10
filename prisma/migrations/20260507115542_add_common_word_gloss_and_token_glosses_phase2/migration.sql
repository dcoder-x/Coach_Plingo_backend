-- AlterTable
ALTER TABLE "ScenarioComprehension" ADD COLUMN     "tokenGlosses" JSONB;

-- CreateTable
CREATE TABLE "CommonWordGloss" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lemma" TEXT,
    "baseLanguageGloss" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "frequencyRank" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'common_lexicon',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommonWordGloss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommonWordGloss_language_idx" ON "CommonWordGloss"("language");

-- CreateIndex
CREATE INDEX "CommonWordGloss_frequencyRank_idx" ON "CommonWordGloss"("frequencyRank");

-- CreateIndex
CREATE UNIQUE INDEX "CommonWordGloss_language_token_key" ON "CommonWordGloss"("language", "token");
