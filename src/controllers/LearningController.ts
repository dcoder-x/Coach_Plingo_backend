import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  LearningService,
  CreateLearningPathInput,
  UpdateLearningPathInput,
} from '../services/LearningService';
import {
  LessonSessionService,
  completeScenarioSessionSchema,
} from '../services/LessonSessionService';
import { SimpleLogger } from '../utils/Logger';
import { AppError } from '../utils/AppError';

const logger = new SimpleLogger('LearningController');

export class LearningController {
  private learningService: LearningService;
  private lessonSessionService: LessonSessionService;

  constructor(prisma: PrismaClient) {
    this.learningService = new LearningService(prisma);
    this.lessonSessionService = new LessonSessionService(prisma);
  }

  /**
   * POST /learning/paths
   * Create new learning path
   */
  async createPath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const input: CreateLearningPathInput = req.body;
      const result = await this.learningService.createLearningPath(req.learnerId, input);

      logger.info(
        `Resolved learning path (${result.action}): ${result.path.id} for learner ${req.learnerId}`,
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id/current-scenario-session
   * Returns v3 scenario session payload (or PREPARING in dynamic mode).
   */
  async getCurrentScenarioSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const session = await this.lessonSessionService.getCurrentScenarioSession(id, req.learnerId);

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /learning/paths/:id/current-scenario-session/complete
   * Submit completed scenario lesson payload for v3 flow.
   */
  async completeCurrentScenarioSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const input = completeScenarioSessionSchema.parse(req.body);
      const result = await this.lessonSessionService.completeScenarioSession(id, req.learnerId, input);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id/lessons
   * Returns scenario lesson map grouped by subcategory.
   */
  async getLessons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const lessons = await this.lessonSessionService.getScenarioLessonMap(id, req.learnerId);

      res.json({
        success: true,
        data: lessons,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /learning/paths/:id/lessons/:lessonId/retake
   * Resets completed lesson progress for retake and returns the lesson payload.
   */
  async retakeLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id, lessonId } = req.params;
      const payload = await this.lessonSessionService.startScenarioRetake(id, req.learnerId, lessonId);

      res.json({
        success: true,
        data: payload,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths
   * Get all learning paths for authenticated learner
   */
  async getPaths(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const status =
        typeof req.query.status === 'string' &&
          ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].includes(req.query.status.toUpperCase())
          ? (req.query.status.toUpperCase() as 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED')
          : undefined;
      const paths = await this.learningService.getLearnerPaths(req.learnerId, status);

      res.json({
        success: true,
        data: { paths },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id
   * Get specific learning path
   */
  async getPath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      // Verify ownership
      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized to access this path');
      }

      res.json({
        success: true,
        data: { path },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /learning/paths/:id/archive
   * Archive an active path
   */
  async archivePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const archived = await this.learningService.archiveLearningPath(id, req.learnerId);

      res.json({
        success: true,
        data: archived,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /learning/paths/:id/resume
   * Resume an archived or paused path
   */
  async resumePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const resumed = await this.learningService.resumeLearningPath(id, req.learnerId);

      res.json({
        success: true,
        data: {
          action: 'RESUMED',
          path: resumed,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /learning/paths/:id/reset
   * Reset path progress and start over with same settings
   */
  async resetPath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const reset = await this.learningService.resetLearningPath(id, req.learnerId);

      res.json({
        success: true,
        data: {
          action: 'RESET',
          path: reset.path,
          ...(reset.restored !== undefined ? { restored: reset.restored } : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id/subcategories
   * Return subcategory progression for a path
   */
  async getPathSubcategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const subcategories = await this.learningService.getPathSubcategories(id);

      res.json({
        success: true,
        data: { subcategories },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /learning/paths/:id
   * Update learning path
   */
  async updatePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized to access this path');
      }

      const input: UpdateLearningPathInput = req.body;
      const updated = await this.learningService.updateLearningPath(id, input);

      logger.info(`Updated learning path: ${id}`);

      res.json({
        success: true,
        data: { path: updated },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /learning/paths/:id
   * Delete learning path
   */
  async deletePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      await this.learningService.deleteLearningPath(id);

      logger.info(`Deleted learning path: ${id}`);

      res.json({
        success: true,
        data: { message: 'Path deleted successfully' },
      });
    } catch (error) {
      next(error);
    }
  }
  /**
   * GET /learning/paths/:id/vocabulary
   * Get vocabulary for a learning path with filtering
   */
  async getPathVocabulary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const status = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
      const search = req.query.search ? String(req.query.search) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const vocabulary = await this.learningService.getPathVocabulary(id, {
        status: status as 'ALL' | 'ACTIVE' | 'LOCKED' | 'MASTERED',
        search,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: vocabulary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id/progress
   * Get path progress metrics for dashboard
   */
  async getPathProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const progress = await this.learningService.getPathProgress(id);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }
}
