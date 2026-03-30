import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { PronunciationController } from '../controllers/PronunciationController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const prisma = new PrismaClient();
const controller = new PronunciationController(prisma);

const referenceAudioQuerySchema = z.object({
  word: z.string().min(1, 'word is required'),
  language: z.string().min(1, 'language is required'),
});

const recordAttemptSchema = z.object({
  exerciseId: z.string().min(1, 'exerciseId is required'),
  recordedAudioUrl: z.string().url('recordedAudioUrl must be a valid URL'),
  accuracyScore: z.number().min(0).max(100),
});

const scoreAttemptSchema = z
  .object({
    exerciseId: z.string().min(1, 'exerciseId is required'),
    recordedAudioUrl: z.string().url('recordedAudioUrl must be a valid URL'),
    transcript: z.string().min(1).optional(),
    externalAccuracyScore: z.number().min(0).max(100).optional(),
  })
  .refine(
    (value) => typeof value.externalAccuracyScore === 'number' || Boolean(value.transcript),
    {
      message: 'Provide either externalAccuracyScore or transcript',
      path: ['externalAccuracyScore'],
    },
  );

/**
 * GET /pronunciation/reference-audio?word=...&language=...
 * Retrieve cached pronunciation audio or generate and cache it.
 */
router.get(
  '/reference-audio',
  authenticateToken,
  validate({ query: referenceAudioQuerySchema }),
  (req, res, next) => controller.getReferenceAudio(req, res, next),
);

/**
 * POST /pronunciation/attempts
 * Record scored pronunciation attempt for an exercise.
 */
router.post(
  '/attempts',
  authenticateToken,
  validate({ body: recordAttemptSchema }),
  (req, res, next) => controller.recordAttempt(req, res, next),
);

/**
 * POST /pronunciation/score-attempt
 * Score an attempt server-side and persist it.
 */
router.post(
  '/score-attempt',
  authenticateToken,
  validate({ body: scoreAttemptSchema }),
  (req, res, next) => controller.scoreAttempt(req, res, next),
);

export default router;
