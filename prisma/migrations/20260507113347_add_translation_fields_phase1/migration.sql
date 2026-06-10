-- AlterTable
ALTER TABLE "ComprehensionQuestion" ADD COLUMN     "optionsTranslation" JSONB,
ADD COLUMN     "questionTranslation" TEXT;

-- AlterTable
ALTER TABLE "ScenarioComprehension" ADD COLUMN     "contentTranslation" TEXT;
