import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ProgressService, RecordAttemptInput } from '../services/ProgressService';
import { SimpleLogger } from '../utils/Logger';
import { AppError } from '../utils/AppError';

const logger = new SimpleLogger('ProgressController');

export class ProgressController {
  private progressService: ProgressService;

  constructor(private prisma: PrismaClient) {
    this.progressService = new ProgressService(prisma);
  }

  /**
   * POST /progress/record-attempt
   * Record word learning attempt and calculate mastery
   */
  async recordAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: RecordAttemptInput = req.body;

      // Verify path ownership
      const path = await this.prisma.learningPath.findUnique({
        where: { id: input.learningPathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const updated = await this.progressService.recordAttempt(input);

      logger.info(`Recorded attempt for word ${input.wordId}`);

      res.json({
        success: true,
        data: {
          wordState: {
            masteryScore: Number(updated.masteryScore),
            pronunciationScore: Number(updated.pronunciationScore),
            status: updated.status,
            attemptCount: updated.attemptCount,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /progress/stats/:pathId
   * Get progress statistics for a learning path
   */
  async getProgressStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId } = req.params;

      // Verify ownership
      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const stats = await this.progressService.getProgressStats(pathId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /progress/mastery-breakdown/:pathId
   * Get mastery score breakdown
   */
  async getMasteryBreakdown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId } = req.params;

      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const breakdown = await this.progressService.getMasteryBreakdown(pathId);

      res.json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /progress/top-words/:pathId
   * Get top mastered words
   */
  async getTopWords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const words = await this.progressService.getTopWords(pathId, limit);

      res.json({
        success: true,
        data: { words },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /progress/needs-work/:pathId
   * Get words needing most work
   */
  async getWordsMostNeedingWork(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const words = await this.progressService.getWordsMostNeedingWork(pathId, limit);

      res.json({
        success: true,
        data: { words },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /progress/daily-activity/:pathId
   * Get daily activity over past N days
   */
  async getDailyActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId } = req.params;
      const daysBack = req.query.days ? parseInt(req.query.days as string) : 7;

      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const activity = await this.progressService.getDailyActivity(pathId, daysBack);

      res.json({
        success: true,
        data: { activity },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /progress/milestone/:pathId/:milestoneNumber
   * Get milestone progress percentage
   */
  async getMilestoneProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId, milestoneNumber } = req.params;

      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const progress = await this.progressService.getMilestoneProgress(
        pathId,
        parseInt(milestoneNumber) as 1 | 2 | 3,
      );

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }
}
