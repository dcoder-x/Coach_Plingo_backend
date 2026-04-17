import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const words = await prisma.globalVocabularyWord.findMany({
    select: {
      word: true,
      complexityLevel: true,
      tags: true,
      vocabularySet: {
        select: {
          language: true,
          profession: true,
        }
      }
    }
  });
  console.log(JSON.stringify(words, null, 2));
}

main().finally(() => prisma.$disconnect());
