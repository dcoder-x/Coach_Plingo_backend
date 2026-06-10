import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { BadgeService } from '../services/BadgeService';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';

const logger = new SimpleLogger('BadgeController');

export class BadgeController {
  private badgeService: BadgeService;

  constructor(prisma: PrismaClient) {
    this.badgeService = new BadgeService(prisma);
  }

  /**
   * GET /badges
   * Full badge catalog with the learner's earned status.
   */
  async getAllBadges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) throw AppError.unauthorized('Not authenticated');

      const badges = await this.badgeService.getLearnerBadges(req.learnerId);

      res.json({ success: true, data: { badges } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /badges/earned
   * Only badges this learner has earned, most recent first.
   */
  async getEarnedBadges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) throw AppError.unauthorized('Not authenticated');

      const badges = await this.badgeService.getEarnedBadges(req.learnerId);

      res.json({ success: true, data: { badges } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /badges/recently-earned
   * Badges earned in the last 5 minutes (or since a provided ISO timestamp).
   * Used by the frontend to trigger celebration modals after an action.
   */
  async getRecentlyEarned(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) throw AppError.unauthorized('Not authenticated');

      const since = req.query.since
        ? new Date(req.query.since as string)
        : undefined;

      const badges = await this.badgeService.getRecentlyEarned(req.learnerId, since);

      logger.debug(`Recently-earned check for ${req.learnerId}: ${badges.length} badge(s)`);

      res.json({ success: true, data: { badges } });
    } catch (error) {
      next(error);
    }
  }
}
