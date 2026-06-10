import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';
import { BadgeService } from './BadgeService';
import { NotificationService } from './NotificationService';

type MilestoneType = 'VOCABULARY_SPRINT' | 'COMPREHENSION' | 'PRONUNCIATION_MASTERY';
type MilestoneStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED';

interface LearningPathRecord {
  id: string;
  learnerId: string;
  language: string;
  profession: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  currentMilestone: number;
  currentSubcategoryId: string | null;
  subcategoriesCompleted: number;
  wordsPerLesson: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentSubcategory?: {
    id: string;
    name: string;
    position: number;
  } | null;
}

interface MilestoneRecord {
  id: string;
  learningPathId: string;
  milestoneNumber: number;
  type: MilestoneType;
  status: MilestoneStatus;
  generatedWords: unknown;
  unlockedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Validation schemas
export const createLearningPathSchema = z.object({
  language: z.string().min(2, 'Language is required'),
  profession: z.string().min(2, 'Profession is required'),
  subcategoryId: z.string().min(1, 'Subcategory is required'),
  wordsPerLesson: z.number().int().min(5).max(100).default(20),
});

export const updateLearningPathSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  wordsPerLesson: z.number().int().min(5).max(100).optional(),
});

export type CreateLearningPathInput = z.infer<typeof createLearningPathSchema>;
export type UpdateLearningPathInput = z.infer<typeof updateLearningPathSchema>;

export interface LearningPathResponse {
  id: string;
  learnerId: string;
  language: string;
  profession: string;
  status: string;
  wordsPerLesson: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentSubcategory?: {
    id: string;
    name: string;
    position: number;
    total: number;
  } | null;
}

export interface MilestoneResponse {
  id: string;
  learningPathId: string;
  milestoneNumber: number;
  type: string;
  status: string;
  generatedWords: string[] | null;
  unlockedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LearningService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;
  private badgeService: BadgeService;
  private notificationService: NotificationService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('LearningService');
    this.badgeService = new BadgeService(prisma);
    this.notificationService = new NotificationService(prisma);
  }

  /**
   * Create a new learning path for a learner
   * Validates duplicate (learner_id, language, profession) constraint
   */
  async createLearningPath(
    learnerId: string,
    input: CreateLearningPathInput,
  ): Promise<{
    path: LearningPathResponse;
    restored?: boolean;
    action: 'CREATED' | 'RESTORED';
  }> {
    // Enforce single active path per learner.
    const existingActivePath = await this.prisma.learningPath.findFirst({
      where: {
        learnerId,
        status: 'ACTIVE',
      },
      select: { id: true, language: true, profession: true },
    });

    // Check for existing path with same language and profession
    const existing = await this.prisma.learningPath.findFirst({
      where: {
        learnerId,
        language: input.language,
        profession: input.profession,
      },
      include: { currentSubcategory: true },
    });

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw AppError.conflict(
          'An active learning path already exists for this language and profession.',
          {
            code: 'ACTIVE_PATH_EXISTS',
            activePathId: existing.id,
          },
        );
      }

      if (existingActivePath && existingActivePath.id !== existing.id) {
        throw AppError.conflict(
          'An active learning path already exists. Archive it before restoring another path.',
          {
            code: 'ACTIVE_PATH_EXISTS',
            activePathId: existingActivePath.id,
          },
        );
      }

      // Auto-restore archived/paused path
      const restored = await this.prisma.learningPath.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE' },
        include: { currentSubcategory: { select: { id: true, name: true, position: true } } },
      });

      const subtotal = await this.prisma.subcategoryProgress.count({
        where: { learningPathId: existing.id },
      });

      this.logger.info(`Restored existing learning path ${existing.id} for learner ${learnerId}`);

      return {
        path: this.formatPath(restored as any, subtotal, restored.currentSubcategory as any),
        restored: true,
        action: 'RESTORED',
      };
    }

    const professionOpt = await this.prisma.professionOption.findUnique({
      where: { slug: input.profession },
    });

    if (!professionOpt) {
      throw AppError.badRequest('Selected profession is not configured');
    }

    const subcategoriesRaw = await this.prisma.professionSubcategory.findMany({
      where: {
        profession: { id: professionOpt?.id || '' },
      },
      orderBy: { position: 'asc' },
    });

    const subcategories = this.calculateSubcategoryAllocations(subcategoriesRaw);

    if (subcategories.length === 0) {
      throw AppError.badRequest('No subcategories configured for this profession and language');
    }

    const selectedSubcategory = subcategories.find((subcategory) => subcategory.id === input.subcategoryId);
    if (!selectedSubcategory) {
      throw AppError.badRequest('Subcategory does not belong to the selected profession and language');
    }

    // Create learning path and initialize V3 scenario progress in a transaction.
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const path = await tx.learningPath.create({
        data: {
          learnerId,
          language: input.language,
          profession: input.profession,
          professionId: professionOpt.id,
          currentSubcategoryId: input.subcategoryId,
          wordsPerLesson: input.wordsPerLesson,
          status: 'ACTIVE',
          currentMilestone: 1,
        },
      });

      await tx.subcategoryProgress.createMany({
        data: subcategories.map((subcategory) => ({
          learningPathId: path.id,
          subcategoryId: subcategory.id,
          status: subcategory.id === input.subcategoryId ? 'ACTIVE' : 'PENDING',
          wordsCompleted: 0,
          wordsTotal: subcategory.wordAllocation,
          milestonesCompleted: 0,
          unlockedAt: subcategory.id === input.subcategoryId ? new Date() : null,
        })),
      });

      const scenarios = await tx.professionScenario.findMany({
        where: { professionId: professionOpt.id },
        orderBy: { position: 'asc' },
      });

      if (scenarios.length > 0) {
        const lessonSeeds = subcategories.flatMap((subcategory) =>
          scenarios.map((scenario) => ({
            subcategoryId: subcategory.id,
            scenarioId: scenario.id,
            language: input.language,
            scenarioPosition: scenario.position,
            status: 'DRAFT' as const,
          })),
        );

        if (lessonSeeds.length > 0) {
          await tx.scenarioLesson.createMany({
            data: lessonSeeds,
            skipDuplicates: true,
          });
        }

        const scenarioLessons = await tx.scenarioLesson.findMany({
          where: {
            language: input.language,
            subcategoryId: { in: subcategories.map((subcategory) => subcategory.id) },
            scenario: {
              professionId: professionOpt.id,
            },
          },
          include: {
            subcategory: {
              select: {
                position: true,
              },
            },
          },
          orderBy: [
            { subcategory: { position: 'asc' } },
            { scenarioPosition: 'asc' },
          ],
        });

        if (scenarioLessons.length > 0) {
          await tx.learnerScenarioProgress.createMany({
            data: scenarioLessons.map((lesson) => ({
              learningPathId: path.id,
              lessonId: lesson.id,
              status: 'LOCKED' as const,
            })),
            skipDuplicates: true,
          });

          const firstLesson = scenarioLessons.find(
            (lesson) => lesson.subcategoryId === input.subcategoryId,
          ) ?? scenarioLessons[0];

          await tx.learnerScenarioProgress.update({
            where: {
              learningPathId_lessonId: {
                learningPathId: path.id,
                lessonId: firstLesson.id,
              },
            },
            data: {
              status: 'ACTIVE',
              unlockedAt: new Date(),
              startedAt: new Date(),
            },
          });

          await tx.learningPath.update({
            where: { id: path.id },
            data: {
              currentScenarioId: firstLesson.scenarioId,
            },
          });

          const firstLessonWords = await tx.scenarioWord.findMany({
            where: { lessonId: firstLesson.id },
            select: { id: true },
          });

          for (const word of firstLessonWords) {
            await tx.learnerWordState.upsert({
              where: {
                learningPathId_scenarioWordId: {
                  learningPathId: path.id,
                  scenarioWordId: word.id,
                },
              },
              update: {
                status: 'ACTIVE',
              },
              create: {
                learningPathId: path.id,
                scenarioWordId: word.id,
                status: 'ACTIVE',
              },
            });
          }
        }
      }

      return { path, selectedSubcategory, subcategoryTotal: subcategories.length };
    });

    this.logger.info(
      `Created learning path for learner ${learnerId}: ${input.language} (${input.profession})`,
    );

    return {
      path: this.formatPath(result.path, result.subcategoryTotal, result.selectedSubcategory),
      action: 'CREATED',
    };
  }

  /**
   * Get learning path by ID
   */
  async getLearningPath(pathId: string): Promise<LearningPathResponse> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      include: {
        currentSubcategory: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    const total = await this.prisma.subcategoryProgress.count({
      where: { learningPathId: pathId },
    });

    return this.formatPath(path, total);
  }

  /**
   * Get all learning paths for a learner
   */
  async getLearnerPaths(
    learnerId: string,
    status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED',
  ): Promise<LearningPathResponse[]> {
    const paths = await this.prisma.learningPath.findMany({
      where: {
        learnerId,
        ...(status ? { status } : {}),
      },
      include: {
        currentSubcategory: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totals = await this.prisma.subcategoryProgress.groupBy({
      by: ['learningPathId'],
      where: {
        learningPathId: {
          in: paths.map((path) => path.id),
        },
      },
      _count: {
        learningPathId: true,
      },
    });

    const totalByPath = new Map(totals.map((item) => [item.learningPathId, item._count.learningPathId]));

    return paths.map((p: LearningPathRecord) => this.formatPath(p, totalByPath.get(p.id) || 0));
  }

  /**
   * Get learning path for a specific language/profession combo
   */
  async getLearningPathByLanguageAndProfession(
    learnerId: string,
    language: string,
    profession: string,
  ): Promise<LearningPathResponse | null> {
    const path = await this.prisma.learningPath.findFirst({
      where: {
        learnerId,
        language,
        profession,
      },
    });

    return path ? this.formatPath(path) : null;
  }

  /**
   * Update learning path
   */
  async updateLearningPath(
    pathId: string,
    input: UpdateLearningPathInput,
  ): Promise<LearningPathResponse> {
    const existingPath = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      select: { id: true, learnerId: true, status: true },
    });

    if (!existingPath) {
      throw AppError.notFound('Learning path not found');
    }

    if (input.status === 'ACTIVE') {
      if (existingPath.status === 'COMPLETED') {
        throw AppError.badRequest('Cannot resume a completed path');
      }

      const existingActivePath = await this.prisma.learningPath.findFirst({
        where: {
          learnerId: existingPath.learnerId,
          status: 'ACTIVE',
          id: { not: pathId },
        },
        select: { id: true },
      });

      if (existingActivePath) {
        throw AppError.conflict(
          'An active learning path already exists. Archive it before activating another path.',
          {
            code: 'ACTIVE_PATH_EXISTS',
            activePathId: existingActivePath.id,
          },
        );
      }
    }

    const path = await this.prisma.learningPath.update({
      where: { id: pathId },
      data: {
        status: input.status,
        wordsPerLesson: input.wordsPerLesson,
      },
    });

    this.logger.info(`Updated learning path: ${pathId}`);

    return this.formatPath(path);
  }

  /**
   * Get active milestone for a learning path
   */
  async getActiveMilestone(pathId: string): Promise<MilestoneResponse> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    const milestone = await this.prisma.milestone.findUnique({
      where: {
        learningPathId_milestoneNumber: {
          learningPathId: pathId,
          milestoneNumber: path.currentMilestone,
        },
      },
    });

    if (!milestone) {
      throw AppError.notFound('Milestone not found');
    }

    return this.formatMilestone(milestone);
  }

  /**
   * Get all milestones for a learning path
   */
  async getMilestones(pathId: string): Promise<MilestoneResponse[]> {
    const milestones = await this.prisma.milestone.findMany({
      where: { learningPathId: pathId },
      orderBy: { milestoneNumber: 'asc' },
    });

    return milestones.map((m: MilestoneRecord) => this.formatMilestone(m));
  }

  /**
   * Complete milestone and advance to next
   * Called when milestone 1 completes (vocabulary sprint threshold)
   * and milestone 2 completes (comprehension)
   */
  async advanceToNextMilestone(pathId: string): Promise<{
    currentMilestone: MilestoneResponse;
    nextMilestone?: MilestoneResponse;
  }> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.currentMilestone >= 3) {
      throw AppError.conflict('All milestones completed');
    }

    // Complete current milestone
    const completedMilestone = await this.prisma.milestone.update({
      where: {
        learningPathId_milestoneNumber: {
          learningPathId: pathId,
          milestoneNumber: path.currentMilestone,
        },
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    const nextMilestoneNumber = path.currentMilestone + 1;
    let nextMilestone = null;

    if (nextMilestoneNumber <= 3) {
      // Unlock next milestone
      nextMilestone = await this.prisma.milestone.update({
        where: {
          learningPathId_milestoneNumber: {
            learningPathId: pathId,
            milestoneNumber: nextMilestoneNumber,
          },
        },
        data: {
          status: 'ACTIVE',
          unlockedAt: new Date(),
        },
      });

      // Update learning path
      await this.prisma.learningPath.update({
        where: { id: pathId },
        data: {
          currentMilestone: nextMilestoneNumber,
          completedAt: nextMilestoneNumber === 3 ? new Date() : null,
        },
      });
    } else {
      // Path fully completed
      await this.prisma.learningPath.update({
        where: { id: pathId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    this.logger.info(
      `Advanced path ${pathId} from milestone ${path.currentMilestone} to ${nextMilestoneNumber}`,
    );

    // Badge + notification for milestone completion (fire-and-forget)
    const milestoneTypeMap: Record<number, 'VOCABULARY_SPRINT' | 'COMPREHENSION' | 'PRONUNCIATION_MASTERY'> = {
      1: 'VOCABULARY_SPRINT',
      2: 'COMPREHENSION',
      3: 'PRONUNCIATION_MASTERY',
    };
    const completedType = milestoneTypeMap[path.currentMilestone];
    if (completedType) {
      this.badgeService
        .checkAndAwardBadges({
          type: 'MILESTONE_COMPLETED',
          learnerId: path.learnerId,
          milestoneType: completedType,
        })
        .catch((err: Error) =>
          this.logger.error(`Milestone badge check failed: ${err.message}`),
        );

      this.notificationService
        .notifyMilestoneCompleted(path.learnerId, completedMilestone.type, path.language)
        .catch((err: Error) =>
          this.logger.error(`Milestone notification failed: ${err.message}`),
        );
    }

    return {
      currentMilestone: this.formatMilestone(completedMilestone),
      nextMilestone: nextMilestone ? this.formatMilestone(nextMilestone) : undefined,
    };
  }

  /**
   * Update generated words for milestone 1 (prevent duplicates)
   */
  async updateGeneratedWords(milestoneId: string, newWords: string[]): Promise<void> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone) {
      throw AppError.notFound('Milestone not found');
    }

    const existingWords = Array.isArray(milestone.generatedWords) ? milestone.generatedWords : [];
    const combinedWords = Array.from(new Set([...existingWords, ...newWords]));

    await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        generatedWords: combinedWords,
      },
    });

    this.logger.debug(`Updated generated words for milestone ${milestoneId}`, {
      newWordCount: newWords.length,
      totalWords: combinedWords.length,
    });
  }

  /**
   * Get generated words for milestone (for duplicate prevention)
   */
  async getGeneratedWords(milestoneId: string): Promise<string[]> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone) {
      throw AppError.notFound('Milestone not found');
    }

    return Array.isArray(milestone.generatedWords)
      ? milestone.generatedWords.filter((word): word is string => typeof word === 'string')
      : [];
  }

  /**
   * Delete learning path (cascade deletes milestones, word states, etc.)
   */
  async deleteLearningPath(pathId: string): Promise<void> {
    await this.prisma.learningPath.delete({
      where: { id: pathId },
    });

    this.logger.info(`Deleted learning path: ${pathId}`);
  }

  async resetLearningPath(
    pathId: string,
    learnerId: string,
  ): Promise<{ path: LearningPathResponse; restored?: boolean; action: 'CREATED' | 'RESTORED' }> {
    const path = await this.prisma.learningPath.findFirst({
      where: { id: pathId, learnerId },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    let subcategoryId = path.currentSubcategoryId;
    if (!subcategoryId) {
      const professionOpt = await this.prisma.professionOption.findUnique({ where: { slug: path.profession } });
      const firstSub = await this.prisma.professionSubcategory.findFirst({
        where: { professionId: professionOpt?.id },
        orderBy: { position: 'asc' },
      });
      subcategoryId = firstSub?.id || '';
    }

    const input: CreateLearningPathInput = {
      language: path.language,
      profession: path.profession,
      subcategoryId,
      wordsPerLesson: path.wordsPerLesson,
    };

    await this.deleteLearningPath(pathId);
    return this.createLearningPath(learnerId, input);
  }

  async resumeLearningPath(pathId: string, learnerId: string): Promise<LearningPathResponse> {
    const path = await this.prisma.learningPath.findFirst({
      where: { id: pathId, learnerId },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.status === 'COMPLETED') {
      throw AppError.badRequest('Cannot resume a completed path');
    }

    if (path.status === 'ACTIVE') {
      throw AppError.badRequest('Path is already active');
    }

    const existingActivePath = await this.prisma.learningPath.findFirst({
      where: {
        learnerId,
        status: 'ACTIVE',
        id: { not: pathId },
      },
      select: { id: true },
    });

    if (existingActivePath) {
      throw AppError.conflict(
        'An active learning path already exists. Archive it before resuming another path.',
        {
          code: 'ACTIVE_PATH_EXISTS',
          activePathId: existingActivePath.id,
        },
      );
    }

    const updated = await this.prisma.learningPath.update({
      where: { id: pathId },
      data: { status: 'ACTIVE' },
      include: { currentSubcategory: { select: { id: true, name: true, position: true } } },
    });

    const subtotal = await this.prisma.subcategoryProgress.count({
      where: { learningPathId: pathId },
    });

    this.logger.info(`Resumed learning path ${pathId}`);

    return this.formatPath(updated as any, subtotal, updated.currentSubcategory as any);
  }

  async archiveLearningPath(pathId: string, learnerId: string): Promise<{
    pathId: string;
    status: 'ARCHIVED';
    archivedAt: Date;
  }> {
    const path = await this.prisma.learningPath.findFirst({
      where: {
        id: pathId,
        learnerId,
      },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.status === 'COMPLETED') {
      throw AppError.badRequest('ALREADY_COMPLETED');
    }

    if (path.status === 'ARCHIVED') {
      throw AppError.badRequest('ALREADY_ARCHIVED');
    }

    const archivedAt = new Date();
    await this.prisma.learningPath.update({
      where: { id: pathId },
      data: {
        status: 'ARCHIVED',
        completedAt: archivedAt,
      },
    });

    return {
      pathId,
      status: 'ARCHIVED',
      archivedAt,
    };
  }

  async getPathSubcategories(pathId: string): Promise<Array<{
    id: string;
    name: string;
    position: number;
    status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
    wordsCompleted: number;
    wordsTotal: number;
    milestonesCompleted: number;
    completedAt: Date | null;
  }>> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      select: { currentSubcategoryId: true },
    });

    const rows = await this.prisma.subcategoryProgress.findMany({
      where: { learningPathId: pathId },
      include: {
        subcategory: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
      orderBy: {
        subcategory: {
          position: 'asc',
        },
      },
    });

    const mapped = rows.map((row) => ({
      id: row.subcategory.id,
      name: row.subcategory.name,
      position: row.subcategory.position,
      status: row.status,
      wordsCompleted: row.wordsCompleted,
      wordsTotal: row.wordsTotal,
      milestonesCompleted: row.milestonesCompleted,
      completedAt: row.completedAt,
    }));

    const currentSubcategoryId =
      mapped.find((subcategory) => subcategory.status === 'ACTIVE')?.id ||
      path?.currentSubcategoryId;
    if (!currentSubcategoryId) {
      return mapped;
    }

    const startIndex = mapped.findIndex(
      (subcategory) => subcategory.id === currentSubcategoryId,
    );

    if (startIndex <= 0) {
      return mapped;
    }

    return [...mapped.slice(startIndex), ...mapped.slice(0, startIndex)];
  }

  async getProfessionSubcategories(professionId: string): Promise<{
    profession: string;
    subcategories: Array<{
      id: string;
      name: string;
      description: string | null;
      wordAllocation: number;
      position: number;
    }>;
  }> {
    const profession = await this.prisma.professionOption.findUnique({
      where: { id: professionId },
      select: { slug: true },
    });

    if (!profession) {
      throw AppError.notFound('Profession not found');
    }

    const subcategoriesRaw = await this.prisma.professionSubcategory.findMany({
      where: {
        professionId: professionId,
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        position: true,
      },
    });

    const subcategories = this.calculateSubcategoryAllocations(subcategoriesRaw);

    return {
      profession: profession.slug,
      subcategories,
    };
  }

  async triggerLessonReplenishment(learningPathId: string): Promise<void> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: learningPathId },
      include: { learner: true },
    });
    if (!path || path.currentMilestone !== 1) return;

    // Find the next subcategory to generate words for
    const subProgress = await this.prisma.subcategoryProgress.findMany({
      where: { learningPathId },
      include: { subcategory: true },
      orderBy: { subcategory: { position: 'asc' } },
    });

    const activeSub = subProgress.find(p => p.wordsCompleted < p.wordsTotal);
    if (!activeSub) {
      this.logger.info(`Path ${learningPathId} has completely maxed all M1 subcategories.`);
      return;
    }

    if (path.currentSubcategoryId !== activeSub.subcategoryId) {
      // Update path to point to new active subcategory
      await this.prisma.learningPath.update({
        where: { id: learningPathId },
        data: { currentSubcategoryId: activeSub.subcategoryId },
      });

      // Update the progress row to appear ACTIVE on the frontend timeline
      await this.prisma.subcategoryProgress.update({
        where: {
          learningPathId_subcategoryId: {
            learningPathId: path.id,
            subcategoryId: activeSub.subcategoryId,
          },
        },
        data: { status: 'ACTIVE', unlockedAt: new Date() },
      });
    }

    const { subcategories } = await this.getProfessionSubcategories(path.profession);
    const { VocabularyService } = require('./VocabularyService');
    const vocabService = new VocabularyService(this.prisma);
    const globalSet = await vocabService.getOrCreateGlobalSet(path.language, path.profession);

    const milestone1 = await this.prisma.milestone.findUnique({
      where: { learningPathId_milestoneNumber: { learningPathId, milestoneNumber: 1 } },
    });

    if (!milestone1) return;

    const { AIService } = require('./AIService');
    const aiService = new AIService(this.prisma);
    await aiService.queueGenerateLesson({
      learningPathId,
      learnerId: path.learnerId,
      language: path.language,
      profession: path.profession,
      currentSubcategoryId: activeSub.subcategoryId,
      currentSubcategoryName: activeSub.subcategory.name,
      currentSubcategoryDescription: activeSub.subcategory.description || undefined,
      subcategories,
      wordsPerLesson: path.wordsPerLesson,
      globalSetId: globalSet.id,
      milestoneId: milestone1.id,
      baseLanguage: path.learner.baseLanguage,
      excludeWords: [],
    });
    this.logger.info(`Triggered replenishment job for path ${learningPathId} in subcategory ${activeSub.subcategory.name}`);
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private calculateSubcategoryAllocations<T>(subcategoriesRaw: T[]): Array<T & { wordAllocation: number }> {
    const totalSubcategories = subcategoriesRaw.length;
    const baseAllocation = totalSubcategories > 0 ? Math.floor(500 / totalSubcategories) : 0;
    let remainder = totalSubcategories > 0 ? 500 % totalSubcategories : 0;

    return subcategoriesRaw.map((sub) => {
      const allocation = baseAllocation + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      return {
        ...sub,
        wordAllocation: allocation,
      };
    });
  }
    /**
     * Get vocabulary for a learning path with filtering and search
     */
    async getPathVocabulary(
      pathId: string,
      filters?: {
        status?: 'ACTIVE' | 'LOCKED' | 'MASTERED' | 'ALL';
        search?: string;
        limit?: number;
        offset?: number;
      },
    ): Promise<{
      data: Array<{
        id: string;
        word: string;
        translation: string;
        status: 'ACTIVE' | 'LOCKED' | 'MASTERED';
        masteryScore: number;
        audioUrl?: string;
        category?: string;
      }>;
      pagination: {
        total: number;
        limit: number;
        offset: number;
      };
    }> {
      const limit = filters?.limit ?? 20;
      const offset = filters?.offset ?? 0;
      const status = filters?.status ?? 'ALL';
      const search = filters?.search?.toLowerCase() ?? '';

      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
        select: { learnerId: true, learner: { select: { baseLanguage: true } } },
      });

      if (!path) {
        throw AppError.notFound('Learning path not found');
      }

      // Build query filters
      const wordStateFilters: any = {
        learningPathId: pathId,
      };

      if (status !== 'ALL') {
        wordStateFilters.status = status;
      }

      // Get word states with vocabulary
      const wordStates = await this.prisma.learnerWordState.findMany({
        where: wordStateFilters,
        include: {
          word: {
            include: {
              translations: {
                where: { baseLanguage: path.learner.baseLanguage },
                take: 1,
              },
              audioCache: true,
            },
          },
        },
        orderBy: { masteryScore: 'asc' },
      });

      const validWordStates = wordStates.filter(
        (ws): ws is (typeof wordStates)[number] & {
          word: NonNullable<(typeof wordStates)[number]['word']>;
          wordId: string;
        } => ws.word !== null && ws.wordId !== null,
      );

      // Filter by search if needed
      let filteredStates = validWordStates;
      if (search) {
        filteredStates = validWordStates.filter(
          (ws) =>
            ws.word.word.toLowerCase().includes(search) ||
            ws.word.translations[0]?.translation.toLowerCase().includes(search),
        );
      }

      // Apply pagination to filtered results
      const totalCount = filteredStates.length;
      const paginatedStates = filteredStates.slice(offset, offset + limit);

      return {
        data: paginatedStates.map((ws) => ({
          id: ws.id,
          word: ws.word.word,
          translation: ws.word.translations[0]?.translation || '',
          status: ws.status,
          masteryScore: Number(ws.masteryScore),
          audioUrl: ws.word.audioCache?.audioUrl,
          category: 'Vocabulary',
        })),
        pagination: {
          total: totalCount,
          limit,
          offset,
        },
      };
    }

    /**
     * Get path progress metrics for dashboard
     */
    async getPathProgress(pathId: string): Promise<{
      completedLessons: number;
      totalLessons: number;
      masteredLessons: number;
      activeLessons: number;
      lockedLessons: number;
      progressPercent: number;
    }> {
      const lessons = await this.prisma.learnerScenarioProgress.findMany({
        where: { learningPathId: pathId },
        select: { status: true, lessonMastered: true },
      });

      const totalLessons = lessons.length;
      const completedLessons = lessons.filter((l) => l.status === 'COMPLETED').length;
      const masteredLessons = lessons.filter((l) => l.lessonMastered).length;
      const activeLessons = lessons.filter((l) => l.status === 'ACTIVE').length;
      const lockedLessons = lessons.filter((l) => l.status === 'LOCKED').length;

      const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        completedLessons,
        totalLessons,
        masteredLessons,
        activeLessons,
        lockedLessons,
        progressPercent,
      };
    }

  private formatPath(
    path: LearningPathRecord,
    totalSubcategories = 0,
    selectedSubcategory?: { id: string; name: string; position: number },
  ): LearningPathResponse {
    const currentSubcategory = selectedSubcategory || path.currentSubcategory || null;

    return {
      id: path.id,
      learnerId: path.learnerId,
      language: path.language,
      profession: path.profession,
      status: path.status,
      wordsPerLesson: path.wordsPerLesson,
      startedAt: path.startedAt,
      completedAt: path.completedAt,
      createdAt: path.createdAt,
      updatedAt: path.updatedAt,
      currentSubcategory: currentSubcategory
        ? {
          id: currentSubcategory.id,
          name: currentSubcategory.name,
          position: currentSubcategory.position,
          total: totalSubcategories,
        }
        : null,
    };
  }

  private formatMilestone(milestone: MilestoneRecord): MilestoneResponse {
    return {
      id: milestone.id,
      learningPathId: milestone.learningPathId,
      milestoneNumber: milestone.milestoneNumber,
      type: milestone.type,
      status: milestone.status,
      generatedWords: Array.isArray(milestone.generatedWords) ? milestone.generatedWords : null,
      unlockedAt: milestone.unlockedAt,
      completedAt: milestone.completedAt,
      createdAt: milestone.createdAt,
      updatedAt: milestone.updatedAt,
    };
  }
}
