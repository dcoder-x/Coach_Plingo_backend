import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';
import { PronunciationController } from '../controllers/PronunciationController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadAudio } from '../middleware/upload';

const router = Router();
const prisma = new PrismaClient();
const controller = new PronunciationController(prisma);
const upload = multer({ storage: multer.memoryStorage() });

const referenceAudioQuerySchema = z.object({
  word: z.string().min(1, 'word is required').optional(),
  wordId: z.string().min(1, 'wordId is required').optional(),
  language: z.string().min(1, 'language is required'),
}).refine((value) => Boolean(value.word || value.wordId), {
  message: 'word or wordId is required',
  path: ['word'],
});

const recordAttemptSchema = z.object({
  exerciseId: z.string().min(1).optional(),
  wordId: z.string().min(1).optional(),
  pathId: z.string().min(1).optional(),
  lessonId: z.string().min(1).optional(),
  recordedAudioUrl: z.string().url('recordedAudioUrl must be a valid URL'),
  accuracyScore: z.number().min(0).max(100),
}).refine((value) => Boolean(value.exerciseId || value.wordId), {
  message: 'exerciseId or wordId is required',
  path: ['exerciseId'],
});

const scoreAttemptSchema = z.object({
  exerciseId: z.string().min(1).optional(),
  wordId: z.string().min(1).optional(),
  pathId: z.string().min(1).optional(),
  lessonId: z.string().min(1).optional(),
  recordedAudioUrl: z.string().url('recordedAudioUrl must be a valid URL').optional(),
  languageCode: z.string().min(2, 'languageCode is required'),
}).refine((value) => Boolean(value.exerciseId || value.wordId), {
  message: 'exerciseId or wordId is required',
  path: ['exerciseId'],
});

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
 * POST /pronunciation/score
 * Score an attempt server-side and persist it.
 * Accepts raw audio file (multipart/form-data with 'audio' field) or pre-uploaded URL (legacy).
 */
router.post(
  '/score-attempt',
  authenticateToken,
  uploadAudio.single('audio'),
  validate({ body: scoreAttemptSchema }),
  (req, res, next) => controller.scoreAttempt(req, res, next),
);

router.post(
  '/score',
  authenticateToken,
  uploadAudio.single('audio'),
  validate({ body: scoreAttemptSchema }),
  (req, res, next) => controller.scoreAttempt(req, res, next),
);

/**
 * POST /pronunciation/upload
 * Upload learner pronunciation audio and return CDN URL (no validation - multipart)
 */
router.post(
  '/upload',
  authenticateToken,
  upload.single('audio'),
  (req, res, next) => controller.uploadPronunciationAudio(req, res, next),
);

export default router;
