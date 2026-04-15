import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { StreakService } from '../services/StreakService';

export class LearnerController {
  private readonly streakService: StreakService;

  constructor(prisma: PrismaClient) {
    this.streakService = new StreakService(prisma);
  }

  async getStreak(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const streak = await this.streakService.getLearnerStreak(req.learnerId);

      res.json({
        success: true,
        data: streak,
      });
    } catch (error) {
      next(error);
    }
  }
}
