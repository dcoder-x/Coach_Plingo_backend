import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

const TEMP_SMOKE_TARGET_TEXT = '__SMOKE_TEST_HOLA__';
const TEMP_SMOKE_REFERENCE_AUDIO_URL = 'https://example.com/reference-audio.wav';

async function main() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const prisma = new PrismaClient();
  const app = createApp();

  try {
    let usedTemporaryExercise = false;
    let exercise = await prisma.pronunciationExercise.findFirst({
      select: {
        id: true,
        milestone: {
          select: {
            learningPath: {
              select: {
                learnerId: true,
                language: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!exercise) {
      const fallbackMilestone = await prisma.milestone.findFirst({
        select: {
          id: true,
          learningPath: {
            select: {
              learnerId: true,
              language: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (!fallbackMilestone) {
        console.log(
          JSON.stringify(
            {
              ok: false,
              reason: 'no_milestone_found_for_temp_exercise',
            },
            null,
            2,
          ),
        );
        return;
      }

      const created = await prisma.pronunciationExercise.create({
        data: {
          milestoneId: fallbackMilestone.id,
          targetText: TEMP_SMOKE_TARGET_TEXT,
          referenceAudioUrl: TEMP_SMOKE_REFERENCE_AUDIO_URL,
          complexityLevel: 'BEGINNER',
          position: 1,
        },
        select: {
          id: true,
          milestone: {
            select: {
              learningPath: {
                select: {
                  learnerId: true,
                  language: true,
                },
              },
            },
          },
        },
      });

      exercise = created;
      usedTemporaryExercise = true;
    }

    const learnerId = exercise.milestone.learningPath.learnerId;
    const languageCode = exercise.milestone.learningPath.language || 'es';

    const token = jwt.sign(
      { learnerId, email: 'smoke@example.com' },
      jwtSecret,
      { expiresIn: '5m' },
    );

    const score = await request(app)
      .post('/pronunciation/score-attempt')
      .set('Authorization', `Bearer ${token}`)
      .send({
        exerciseId: exercise.id,
        recordedAudioUrl: 'https://example.com/audio.m4a',
        languageCode,
      });

    console.log(
      JSON.stringify(
        {
          ok: true,
          usedTemporaryExercise,
          exerciseId: exercise.id,
          learnerId,
          languageCode,
          scoreStatus: score.status,
          scoreBody: score.body,
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
