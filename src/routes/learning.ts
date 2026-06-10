import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { LearningController } from '../controllers/LearningController';
import { PronunciationController } from '../controllers/PronunciationController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadAudio } from '../middleware/upload';
import { createLearningPathSchema, updateLearningPathSchema } from '../services/LearningService';
import { completeScenarioSessionSchema } from '../services/LessonSessionService';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();
const controller = new LearningController(prisma);
const pronunciationController = new PronunciationController(prisma);

// Param validators
const pathIdSchema = z.object({
  id: z.string().min(1, 'Invalid path ID'),
});

const pathLessonParamsSchema = z.object({
  id: z.string().min(1, 'Invalid path ID'),
  lessonId: z.string().min(1, 'Invalid lesson ID'),
});

const pathLessonWordParamsSchema = z.object({
  pathId: z.string().min(1, 'Invalid path ID'),
  lessonId: z.string().min(1, 'Invalid lesson ID'),
  wordId: z.string().min(1, 'Invalid word ID'),
});

const pronunciationScoreBodySchema = z.object({
  recordedAudioUrl: z.string().url('recordedAudioUrl must be a valid URL').optional(),
  languageCode: z.string().min(2, 'languageCode is required'),
});

/**
 * POST /learning/paths
 * Create new learning path
 */
router.post(
  '/paths',
  authenticateToken,
  validate({ body: createLearningPathSchema }),
  (req, res, next) => controller.createPath(req, res, next),
);

/**
 * GET /learning/paths
 * Get all learning paths for learner
 */
router.get(
  '/paths',
  authenticateToken,
  (req, res, next) => controller.getPaths(req, res, next),
);

/**
 * GET /learning/paths/:id
 * Get specific learning path
 */
router.get(
  '/paths/:id',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getPath(req, res, next),
);

/**
 * PATCH /learning/paths/:id/archive
 * Archive active learning path
 */
router.patch(
  '/paths/:id/archive',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.archivePath(req, res, next),
);

/**
 * PATCH /learning/paths/:id/resume
 * Resume an archived learning path
 */
router.patch(
  '/paths/:id/resume',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.resumePath(req, res, next),
);

/**
 * POST /learning/paths/:id/reset
 * Reset archived path progress and create a fresh active path
 */
router.post(
  '/paths/:id/reset',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.resetPath(req, res, next),
);

/**
 * GET /learning/paths/:id/subcategories
 * Get path-level subcategory progress
 */
router.get(
  '/paths/:id/subcategories',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getPathSubcategories(req, res, next),
);

/**
 * PUT /learning/paths/:id
 * Update learning path
 */
router.put(
  '/paths/:id',
  authenticateToken,
  validate({ params: pathIdSchema, body: updateLearningPathSchema }),
  (req, res, next) => controller.updatePath(req, res, next),
);

/**
 * GET /learning/paths/:id/current-scenario-session
 * Get v3 scenario session payload
 */
router.get(
  '/paths/:id/current-scenario-session',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getCurrentScenarioSession(req, res, next),
);

/**
 * POST /learning/paths/:id/current-scenario-session/complete
 * Submit v3 scenario session completion payload
 */
router.post(
  '/paths/:id/current-scenario-session/complete',
  authenticateToken,
  validate({ params: pathIdSchema, body: completeScenarioSessionSchema }),
  (req, res, next) => controller.completeCurrentScenarioSession(req, res, next),
);

/**
 * GET /learning/paths/:id/lessons
 * Get V3 scenario lesson map for a path
 */
router.get(
  '/paths/:id/lessons',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getLessons(req, res, next),
);

/**
 * POST /learning/paths/:id/lessons/:lessonId/retake
 * Start retake flow for a completed V3 scenario lesson
 */
router.post(
  '/paths/:id/lessons/:lessonId/retake',
  authenticateToken,
  validate({ params: pathLessonParamsSchema }),
  (req, res, next) => controller.retakeLesson(req, res, next),
);

/**
 * POST /learning/paths/:pathId/lessons/:lessonId/words/:wordId/pronunciation/score
 * Score pronunciation for a scenario word using ElevenLabs STT plus LLM grading.
 * Accepts raw audio file (multipart/form-data) or pre-uploaded URL (legacy).
 */
router.post(
  '/paths/:pathId/lessons/:lessonId/words/:wordId/pronunciation/score',
  authenticateToken,
  uploadAudio.single('audio'),
  validate({ params: pathLessonWordParamsSchema, body: pronunciationScoreBodySchema }),
  (req, res, next) => pronunciationController.scoreAttempt(req, res, next),
);

/**
 * DELETE /learning/paths/:id
 * Delete learning path
 */
router.delete(
  '/paths/:id',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.deletePath(req, res, next),
);

router.get(
  '/paths/:id/vocabulary',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getPathVocabulary(req, res, next),
);

router.get(
  '/paths/:id/progress',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getPathProgress(req, res, next),
);

export default router;
