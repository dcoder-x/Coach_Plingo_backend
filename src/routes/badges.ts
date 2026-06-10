import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { BadgeController } from '../controllers/BadgeController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
const controller = new BadgeController(prisma);

/**
 * GET /badges
 * Full catalog with earned/not-earned status for the authenticated learner.
 */
router.get(
  '/',
  authenticateToken,
  (req, res, next) => controller.getAllBadges(req, res, next),
);

/**
 * GET /badges/earned
 * Only earned badges, most recent first.
 */
router.get(
  '/earned',
  authenticateToken,
  (req, res, next) => controller.getEarnedBadges(req, res, next),
);

/**
 * GET /badges/recently-earned?since=<ISO>
 * Badges earned in the last 5 minutes (or since provided timestamp).
 */
router.get(
  '/recently-earned',
  authenticateToken,
  (req, res, next) => controller.getRecentlyEarned(req, res, next),
);

export default router;
