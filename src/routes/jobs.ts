import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { GenerateExercisesHandler } from '../jobs/handlers/GenerateExercisesHandler';
import { GenerateLessonHandler } from '../jobs/handlers/GenerateLessonHandler';
import { GenerateStoryHandler } from '../jobs/handlers/GenerateStoryHandler';

const router = Router();
const prisma = new PrismaClient();
const lessonHandler = new GenerateLessonHandler(prisma);
const storyHandler = new GenerateStoryHandler(prisma);
const exercisesHandler = new GenerateExercisesHandler(prisma);

const lessonPayloadSchema = z.object({
  learningPathId: z.string().min(1),
  learnerId: z.string().min(1),
  language: z.string().min(1),
  profession: z.string().min(1),
  wordsPerLesson: z.number().int().min(1).max(100),
  globalSetId: z.string().min(1),
  milestoneId: z.string().min(1),
  baseLanguage: z.string().min(1),
  excludeWords: z.array(z.string()).default([]),
  currentSubcategoryId: z.string().min(1),
  currentSubcategoryName: z.string().min(1),
  currentSubcategoryDescription: z.string().min(1).optional(),
  subcategories: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1).optional(),
      wordAllocation: z.number().int().min(1),
      position: z.number().int().min(1),
    }),
  ).min(1),
});

const storyPayloadSchema = z.object({
  learnerId: z.string().min(1),
  milestoneId: z.string().min(1),
  vocabulary: z.array(
    z.object({
      word: z.string().min(1),
      translation: z.string().min(1),
    }),
  ),
  profession: z.string().min(1),
  language: z.string().min(1),
  baseLanguage: z.string().min(1),
});

const exercisesPayloadSchema = z.object({
  learnerId: z.string().min(1),
  milestoneId: z.string().min(1),
  language: z.string().min(1),
  baseLanguage: z.string().min(1),
  profession: z.string().min(1),
  vocabulary: z.array(z.string().min(1)).min(1),
});

const lessonJobSchema = z.object({
  jobId: z.string().min(1),
  payload: lessonPayloadSchema,
});

const storyJobSchema = z.object({
  jobId: z.string().min(1),
  payload: storyPayloadSchema,
});

const exercisesJobSchema = z.object({
  jobId: z.string().min(1),
  payload: exercisesPayloadSchema,
});

router.post(
  '/generate-lesson',
  validate({ body: lessonJobSchema }),
  async (req, res): Promise<void> => {
    try {
      const result = await lessonHandler.handle(req.body.jobId, req.body.payload);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(200).json({
        success: false,
        error: error instanceof Error ? error.message : 'Lesson job failed',
      });
    }
  },
);

router.post(
  '/generate-story',
  validate({ body: storyJobSchema }),
  async (req, res): Promise<void> => {
    try {
      const result = await storyHandler.handle(req.body.jobId, req.body.payload);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(200).json({
        success: false,
        error: error instanceof Error ? error.message : 'Story job failed',
      });
    }
  },
);

router.post(
  '/generate-exercises',
  validate({ body: exercisesJobSchema }),
  async (req, res): Promise<void> => {
    try {
      const result = await exercisesHandler.handle(req.body.jobId, req.body.payload);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(200).json({
        success: false,
        error: error instanceof Error ? error.message : 'Exercises job failed',
      });
    }
  },
);

export default router;