/**
 * Resets all learner accounts and progress data for a clean tester slate.
 *
 * SAFE to run: does NOT touch generated lesson content:
 *   ScenarioLesson, ScenarioWord, ScenarioComprehension, ComprehensionQuestion,
 *   WordAudioCache, GlobalVocabularySet, GlobalVocabularyWord, VocabularyAudioCache,
 *   WordTranslation, CommonWordGloss, LanguageOption, ProfessionOption,
 *   ProfessionSubcategory, ProfessionScenario
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/reset_learner_data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting learner data reset...\n');

  // Deleting Learner cascades (via onDelete: Cascade) to:
  //   LearningPath → Milestone → Story, PronunciationExercise
  //                → LearnerWordState, SubcategoryProgress, LearnerScenarioProgress
  //   LearnerStreak, LearnerBadge, Notification,
  //   ComprehensionResponse, PronunciationAttempt
  const { count: learnerCount } = await prisma.learner.deleteMany();
  console.log(`Deleted ${learnerCount} learner(s) and all cascaded progress data.`);

  const { count: jobCount } = await prisma.asyncJob.deleteMany();
  console.log(`Deleted ${jobCount} async job(s).`);

  console.log('\nReset complete. Generated lesson content is untouched.');
}

main()
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
