import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { LearningController } from '../controllers/LearningController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createLearningPathSchema, updateLearningPathSchema } from '../services/LearningService';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();
const controller = new LearningController(prisma);

// Param validators
const pathIdSchema = z.object({
  id: z.string().uuid('Invalid path ID'),
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
 * GET /learning/paths/:id/milestones
 * Get all milestones for path
 */
router.get(
  '/paths/:id/milestones',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getMilestones(req, res, next),
);

/**
 * GET /learning/paths/:id/milestone/active
 * Get active milestone
 */
router.get(
  '/paths/:id/milestone/active',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getActiveMilestone(req, res, next),
);

/**
 * POST /learning/paths/:id/milestone/advance
 * Advance to next milestone
 */
router.post(
  '/paths/:id/milestone/advance',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.advanceMilestone(req, res, next),
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

export default router;
