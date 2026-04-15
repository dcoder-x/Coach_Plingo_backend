import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  LearningService,
  CreateLearningPathInput,
  UpdateLearningPathInput,
  LearningPathResponse,
  MilestoneResponse,
} from '../services/LearningService';
import { AIService, QueuedJobResult } from '../services/AIService';
import { VocabularyService } from '../services/VocabularyService';
import { LessonSessionService, completeCurrentSessionSchema } from '../services/LessonSessionService';
import { SimpleLogger } from '../utils/Logger';
import { AppError } from '../utils/AppError';

const logger = new SimpleLogger('LearningController');

export class LearningController {
  private learningService: LearningService;
  private aiService: AIService;
  private vocabularyService: VocabularyService;
  private lessonSessionService: LessonSessionService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.learningService = new LearningService(prisma);
    this.aiService = new AIService(prisma);
    this.vocabularyService = new VocabularyService(prisma);
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
        `Created learning path: ${result.path.id} for learner ${req.learnerId}`,
      );

      // Queue first lesson generation for milestone 1 (non-blocking for generation itself)
      let preparationJob: QueuedJobResult | null = null;
      try {
        preparationJob = await this.triggerFirstLesson(req.learnerId, result);
      } catch (err) {
        logger.error(
          `Failed to auto-queue lesson for path ${result.path.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      res.status(201).json({
        success: true,
        data: {
          ...result,
          preparation: {
            status: preparationJob ? 'PREPARING' : 'QUEUE_FAILED',
            ready: false,
            jobId: preparationJob?.jobId,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Auto-trigger first lesson generation immediately after path creation.
   * Fetches learner's base language, resolves/creates the global vocabulary set,
   * then enqueues a GENERATE_LESSON job for milestone 1.
   */
  private async triggerFirstLesson(
    learnerId: string,
    result: { path: LearningPathResponse; milestones: MilestoneResponse[] },
  ): Promise<QueuedJobResult> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: { baseLanguage: true },
    });

    if (!learner?.baseLanguage) {
      throw AppError.badRequest('Cannot auto-trigger lesson: learner has no base language');
    }

    const milestone1 = result.milestones.find((m) => m.milestoneNumber === 1);
    if (!milestone1) {
      throw AppError.notFound('Cannot auto-trigger lesson: milestone 1 not found');
    }

    const professionOpt = await this.prisma.professionOption.findUnique({
      where: { slug: result.path.profession },
    });

    const subcategoriesRaw = await this.prisma.professionSubcategory.findMany({
      where: {
        professionId: professionOpt?.id || '',
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        position: true,
      },
    });

    const totalSubcats = subcategoriesRaw.length;
    const baseAllocation = totalSubcats > 0 ? Math.floor(500 / totalSubcats) : 0;
    let remainder = totalSubcats > 0 ? 500 % totalSubcats : 0;

    const subcategories = subcategoriesRaw.map((sub) => {
      const allocation = baseAllocation + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      return {
        ...sub,
        wordAllocation: allocation,
      };
    });

    const currentSubcategory = result.path.currentSubcategory
      ? subcategories.find((subcategory) => subcategory.id === result.path.currentSubcategory?.id)
      : null;

    if (!currentSubcategory) {
      throw AppError.notFound('Cannot auto-trigger lesson: current subcategory not found');
    }

    const globalSet = await this.vocabularyService.getOrCreateGlobalSet(
      result.path.language,
      result.path.profession,
    );

    const job = await this.aiService.queueGenerateLesson({
      learningPathId: result.path.id,
      learnerId,
      language: result.path.language,
      profession: result.path.profession,
      currentSubcategoryId: currentSubcategory.id,
      currentSubcategoryName: currentSubcategory.name,
      currentSubcategoryDescription: currentSubcategory.description || undefined,
      subcategories: subcategories.map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        description: subcategory.description || undefined,
        wordAllocation: subcategory.wordAllocation,
        position: subcategory.position,
      })),
      wordsPerLesson: result.path.wordsPerLesson,
      globalSetId: globalSet.id,
      milestoneId: milestone1.id,
      baseLanguage: learner.baseLanguage,
      excludeWords: [],
    });

    logger.info(
      `Auto-queued lesson generation job ${job.jobId} for new path ${result.path.id}`,
    );

    return job;
  }

  /**
   * GET /learning/paths/:id/readiness
   * Readiness signal for first lesson generation after path creation.
   */
  async getPathReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const path = await this.learningService.getLearningPath(id);

      if (path.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const [activeWords, totalAssignedWords, milestone1] = await Promise.all([
        this.prisma.learnerWordState.count({
          where: {
            learningPathId: id,
            status: 'ACTIVE',
          },
        }),
        this.prisma.learnerWordState.count({
          where: {
            learningPathId: id,
          },
        }),
        this.prisma.milestone.findUnique({
          where: {
            learningPathId_milestoneNumber: {
              learningPathId: id,
              milestoneNumber: 1,
            },
          },
          select: {
            id: true,
            generatedWords: true,
          },
        }),
      ]);

      const generatedWordsCount = Array.isArray(milestone1?.generatedWords)
        ? milestone1.generatedWords.length
        : 0;
      const ready = activeWords > 0 && totalAssignedWords > 0;

      res.json({
        success: true,
        data: {
          pathId: id,
          status: ready ? 'READY' : 'PREPARING',
          ready,
          activeWords,
          totalAssignedWords,
          generatedWordsCount,
          milestoneId: milestone1?.id,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /learning/paths/:id/current-session
   * Return a fully orchestrated lesson session payload for the current milestone.
   */
  async getCurrentSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const session = await this.lessonSessionService.getCurrentSession(id, req.learnerId);

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /learning/paths/:id/current-session/complete
   * Submit a completed lesson session in one payload.
   */
  async completeCurrentSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { id } = req.params;
      const input = completeCurrentSessionSchema.parse(req.body);
      const result = await this.lessonSessionService.completeCurrentSession(id, req.learnerId, input);

      res.json({
        success: true,
        data: result,
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
