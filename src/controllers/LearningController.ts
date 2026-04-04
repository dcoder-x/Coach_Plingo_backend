import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  LearningService,
  CreateLearningPathInput,
  UpdateLearningPathInput,
} from '../services/LearningService';
import { AIService } from '../services/AIService';
import { VocabularyService } from '../services/VocabularyService';
import { SimpleLogger } from '../utils/Logger';
import { AppError } from '../utils/AppError';

const logger = new SimpleLogger('LearningController');

export class LearningController {
  private learningService: LearningService;
  private aiService: AIService;
  private vocabularyService: VocabularyService;

  constructor(prisma: PrismaClient) {
    this.learningService = new LearningService(prisma);
    this.aiService = new AIService(prisma);
    this.vocabularyService = new VocabularyService(prisma);
  }

  /**
   * POST /learning/paths
   * Create new learning path and auto-queue first lesson generation
   */
  async createPath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const input: CreateLearningPathInput = req.body;
      const result = await this.learningService.createLearningPath(req.learnerId, input);
      const pathId = result.path.id;
      const isNewPath = !result.path.createdAt || new Date().getTime() - new Date(result.path.createdAt).getTime() < 1000;

      // Auto-queue lesson generation for first milestone if new path
      let queuedJob = null;
      if (isNewPath) {
        try {
          const firstMilestone = result.milestones[0];
          const globalSet = await this.vocabularyService.getOrCreateGlobalSet(
            input.language,
            input.profession,
          );

          queuedJob = await this.aiService.queueGenerateLesson({
            learningPathId: pathId,
            learnerId: req.learnerId,
            language: input.language,
            profession: input.profession,
            wordsPerLesson: input.wordsPerLesson,
            globalSetId: globalSet.id,
            milestoneId: firstMilestone.id,
            baseLanguage: 'en',
            excludeWords: [],
          });

          logger.info(`Auto-queued lesson generation for path ${pathId}: job ${queuedJob.jobId}`);
        } catch (queueError) {
          logger.error(
            `Failed to auto-queue lesson generation for path ${pathId}`,
            queueError instanceof Error ? queueError.message : String(queueError),
          );
          // Don't fail the request if queuing fails — path is still created
        }
      }

      logger.info(
        `Created learning path: ${pathId} for learner ${req.learnerId}`,
      );

      res.status(201).json({
        success: true,
        data: {
          ...result,
          lessonQueuedJob: queuedJob,
        },
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

      const paths = await this.learningService.getLearnerPaths(req.learnerId);

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
   * GET /learning/paths/:id/milestones
   * Get all milestones for a learning path
   */
  async getMilestones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const milestones = await this.learningService.getMilestones(id);

      res.json({
        success: true,
        data: { milestones },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id/milestone/active
   * Get currently active milestone
   */
  async getActiveMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const milestone = await this.learningService.getActiveMilestone(id);

      res.json({
        success: true,
        data: { milestone },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /learning/paths/:id/milestone/advance
   * Advance to next milestone (called when milestone completes)
   */
  async advanceMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const result = await this.learningService.advanceToNextMilestone(id);

      logger.info(`Advanced milestone for path: ${id}`);

      res.json({
        success: true,
        data: result,
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
}
