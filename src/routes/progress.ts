import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ProgressController } from '../controllers/ProgressController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { recordAttemptSchema } from '../services/ProgressService';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();
const controller = new ProgressController(prisma);

// Param validators
const pathIdSchema = z.object({
  pathId: z.string().min(1, 'Invalid path ID'),
});

const milestoneProgressSchema = z.object({
  pathId: z.string().min(1, 'Invalid path ID'),
  milestoneNumber: z.string().regex(/^[1-3]$/, 'Milestone number must be 1, 2, or 3'),
});

/**
 * POST /progress/record-attempt
 * Record word attempt and calculate mastery
 */
router.post(
  '/record-attempt',
  authenticateToken,
  validate({ body: recordAttemptSchema }),
  (req, res, next) => controller.recordAttempt(req, res, next),
);

/**
 * GET /progress/stats/:pathId
 * Get progress statistics
 */
router.get(
  '/stats/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getProgressStats(req, res, next),
);

/**
 * GET /progress/mastery-breakdown/:pathId
 * Get mastery breakdown
 */
router.get(
  '/mastery-breakdown/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getMasteryBreakdown(req, res, next),
);

/**
 * GET /progress/top-words/:pathId
 * Get top mastered words
 */
router.get(
  '/top-words/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getTopWords(req, res, next),
);

/**
 * GET /progress/needs-work/:pathId
 * Get words needing most work
 */
router.get(
  '/needs-work/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getWordsMostNeedingWork(req, res, next),
);

/**
 * GET /progress/daily-activity/:pathId
 * Get daily activity
 */
router.get(
  '/daily-activity/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getDailyActivity(req, res, next),
);

/**
 * GET /progress/milestone/:pathId/:milestoneNumber
 * Get milestone progress
 */
router.get(
  '/milestone/:pathId/:milestoneNumber',
  authenticateToken,
  validate({ params: milestoneProgressSchema }),
  (req, res, next) => controller.getMilestoneProgress(req, res, next),
);

export default router;
