import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up test vocabulary sets...');
  
  const sets = await prisma.globalVocabularySet.findMany();
  let deletedCount = 0;
  
  for (const set of sets) {
    if (set.profession === 'software_engineer' || set.profession === 'doctor') {
      await prisma.globalVocabularySet.delete({ where: { id: set.id } });
      console.log(`Deleted vocabulary set (which cascades to words and active states) for ${set.language} - ${set.profession}`);
      deletedCount++;
    }
  }
  
  console.log(`Cleanup complete. Deleted ${deletedCount} vocabulary sets. Your next lesson generation will trigger a real API call.`);
}

main().finally(() => prisma.$disconnect());
