/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function collectCounts() {
  return {
    learningPaths: await prisma.learningPath.count(),
    milestones: await prisma.milestone.count(),
    subcategoryProgress: await prisma.subcategoryProgress.count(),
    learnerScenarioProgress: await prisma.learnerScenarioProgress.count(),
    learnerWordStates: await prisma.learnerWordState.count(),
    pronunciationAttempts: await prisma.pronunciationAttempt.count(),
    comprehensionResponses: await prisma.comprehensionResponse.count(),
    learnerStreaks: await prisma.learnerStreak.count(),
  };
}

async function main(): Promise<void> {
  const before = await collectCounts();

  await prisma.$transaction(async (tx) => {
    await tx.comprehensionResponse.deleteMany({});
    await tx.pronunciationAttempt.deleteMany({});
    await tx.learnerWordState.deleteMany({});
    await tx.learnerScenarioProgress.deleteMany({});
    await tx.subcategoryProgress.deleteMany({});
    await tx.milestone.deleteMany({});
    await tx.learningPath.deleteMany({});
    await tx.learnerStreak.deleteMany({});
  });

  const after = await collectCounts();

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        before,
        after,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
