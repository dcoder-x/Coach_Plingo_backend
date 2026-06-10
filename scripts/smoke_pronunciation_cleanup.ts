import { PrismaClient } from '@prisma/client';

const TEMP_SMOKE_REFERENCE_AUDIO_URL = 'https://example.com/reference-audio.wav';

async function main() {
  const prisma = new PrismaClient();

  try {
    const exercises = await prisma.pronunciationExercise.findMany({
      where: {
        referenceAudioUrl: TEMP_SMOKE_REFERENCE_AUDIO_URL,
      },
      select: {
        id: true,
      },
    });

    const exerciseIds = exercises.map((item) => item.id);

    if (exerciseIds.length === 0) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            deletedAttempts: 0,
            deletedExercises: 0,
            note: 'No temporary smoke pronunciation exercises found',
          },
          null,
          2,
        ),
      );
      return;
    }

    const deletedAttempts = await prisma.pronunciationAttempt.deleteMany({
      where: {
        exerciseId: { in: exerciseIds },
      },
    });

    const deletedExercises = await prisma.pronunciationExercise.deleteMany({
      where: {
        id: { in: exerciseIds },
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          deletedAttempts: deletedAttempts.count,
          deletedExercises: deletedExercises.count,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
