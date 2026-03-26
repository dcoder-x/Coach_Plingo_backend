import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { VocabularyService } from '../services/VocabularyService';
import { AppError } from '../utils/AppError';

export class VocabularyController {
  private vocabularyService: VocabularyService;

  constructor(private prisma: PrismaClient) {
    this.vocabularyService = new VocabularyService(prisma);
  }

  /**
   * GET /vocabulary/active-window/:pathId
   * Get active learning window for a path
   */
  async getActiveWindow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pathId } = req.params;

      // Get path to verify ownership and get baseLanguage
      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
        include: { learner: true },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const words = await this.vocabularyService.getActiveWindow(
        pathId,
        path.learner.baseLanguage,
      );

      res.json({
        success: true,
        data: { words, count: words.length },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /vocabulary/window-stats/:pathId
   * Get statistics about learning window
   */
  async getWindowStats(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const stats = await this.vocabularyService.getWindowStats(pathId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /vocabulary/word/:wordId
   * Get word details with translations and audio
   */
  async getWord(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { wordId } = req.params;
      const { language } = req.query;

      const word = await this.vocabularyService.getWord(wordId, language as string | undefined);

      res.json({
        success: true,
        data: { word },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /vocabulary/global-set/stats
   * Get statistics for global vocabulary set
   */
  async getGlobalSetStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { language, profession, difficulty } = req.query;

      if (!language || !profession) {
        throw AppError.badRequest('language and profession are required');
      }

      const set = await this.vocabularyService.getOrCreateGlobalSet(
        language as string,
        profession as string,
        (difficulty as any) || 'BEGINNER',
      );

      const stats = await this.vocabularyService.getGlobalSetStats(set.id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}
