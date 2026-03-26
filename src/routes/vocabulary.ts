import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { VocabularyController } from '../controllers/VocabularyController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();
const controller = new VocabularyController(prisma);

// Param and query validators
const pathIdSchema = z.object({
  pathId: z.string().uuid('Invalid path ID'),
});

const wordIdSchema = z.object({
  wordId: z.string().uuid('Invalid word ID'),
});

const globalSetQuerySchema = z.object({
  language: z.string().min(2),
  profession: z.string().min(2),
  difficulty: z.string().optional(),
});

/**
 * GET /vocabulary/active-window/:pathId
 * Get active learning window
 */
router.get(
  '/active-window/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getActiveWindow(req, res, next),
);

/**
 * GET /vocabulary/window-stats/:pathId
 * Get window statistics
 */
router.get(
  '/window-stats/:pathId',
  authenticateToken,
  validate({ params: pathIdSchema }),
  (req, res, next) => controller.getWindowStats(req, res, next),
);

/**
 * GET /vocabulary/word/:wordId
 * Get word details
 */
router.get(
  '/word/:wordId',
  authenticateToken,
  validate({ params: wordIdSchema }),
  (req, res, next) => controller.getWord(req, res, next),
);

/**
 * GET /vocabulary/global-set/stats
 * Get global set statistics
 */
router.get(
  '/global-set/stats',
  authenticateToken,
  validate({ query: globalSetQuerySchema }),
  (req, res, next) => controller.getGlobalSetStats(req, res, next),
);

export default router;
