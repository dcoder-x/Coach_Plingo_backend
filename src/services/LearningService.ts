import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';

type MilestoneType = 'VOCABULARY_SPRINT' | 'COMPREHENSION' | 'PRONUNCIATION_MASTERY';
type MilestoneStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED';

interface LearningPathRecord {
  id: string;
  learnerId: string;
  language: string;
  profession: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  currentMilestone: number;
  wordsPerLesson: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  wordsPerLesson: z.number().int().min(5).max(100).default(20),
});

export const updateLearningPathSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
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
  currentMilestone: number;
  wordsPerLesson: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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

  // Milestone configuration
  private readonly MILESTONE_CONFIG = {
    1: { type: 'VOCABULARY_SPRINT' as MilestoneType, name: 'Vocabulary Sprint', targetWords: 500 },
    2: { type: 'COMPREHENSION' as MilestoneType, name: 'Comprehension', targetWords: 0 },
    3: { type: 'PRONUNCIATION_MASTERY' as MilestoneType, name: 'Pronunciation Mastery', targetWords: 0 },
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('LearningService');
  }

  /**
   * Create a new learning path for a learner
   * Validates duplicate (learner_id, language, profession) constraint
   */
  async createLearningPath(
    learnerId: string,
    input: CreateLearningPathInput,
  ): Promise<{ path: LearningPathResponse; milestones: MilestoneResponse[] }> {
    // Check for existing path
    const existing = await this.prisma.learningPath.findUnique({
      where: {
        learnerId_language_profession: {
          learnerId,
          language: input.language,
          profession: input.profession,
        },
      },
      include: { milestones: true },
    });

    // If an ACTIVE path exists, return it (idempotent)
    if (existing && existing.status === 'ACTIVE') {
      this.logger.info(
        `Returning existing active learning path: ${existing.id} for learner ${learnerId}`,
      );
      return {
        path: this.formatPath(existing),
        milestones: existing.milestones.map((m: MilestoneRecord) => this.formatMilestone(m)),
      };
    }

    // If a path exists but is INACTIVE/FAILED, mark it as ACTIVE and resume
    if (existing) {
      this.logger.info(`Resuming learning path: ${existing.id} for learner ${learnerId}`);
      const resumed = await this.prisma.learningPath.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE' },
      });

      return {
        path: this.formatPath(resumed),
        milestones: existing.milestones.map((m: MilestoneRecord) => this.formatMilestone(m)),
      };
    }

    // Create new learning path with milestones in a transaction
    const result = await this.prisma.$transaction(async (tx: any) => {
      const path = await tx.learningPath.create({
        data: {
          learnerId,
          language: input.language,
          profession: input.profession,
          wordsPerLesson: input.wordsPerLesson,
          status: 'ACTIVE',
          currentMilestone: 1,
        },
      });

      // Create 3 milestones
      const milestones: MilestoneRecord[] = [];
      for (let i = 1; i <= 3; i++) {
        const config = this.MILESTONE_CONFIG[i as keyof typeof this.MILESTONE_CONFIG];
        const milestone = await tx.milestone.create({
          data: {
            learningPathId: path.id,
            milestoneNumber: i,
            type: config.type,
            status: i === 1 ? 'ACTIVE' : ('PENDING' as MilestoneStatus),
            generatedWords: i === 1 ? [] : null,
          },
        });
        milestones.push(milestone);
      }

      return { path, milestones };
    });

    this.logger.info(
      `Created learning path for learner ${learnerId}: ${input.language} (${input.profession})`,
    );

    return {
      path: this.formatPath(result.path),
      milestones: result.milestones.map((m: MilestoneRecord) => this.formatMilestone(m)),
    };
  }

  /**
   * Get learning path by ID
   */
  async getLearningPath(pathId: string): Promise<LearningPathResponse> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    return this.formatPath(path);
  }

  /**
   * Get all learning paths for a learner
   */
  async getLearnerPaths(learnerId: string): Promise<LearningPathResponse[]> {
    const paths = await this.prisma.learningPath.findMany({
      where: { learnerId },
      orderBy: { createdAt: 'desc' },
    });

    return paths.map((p: LearningPathRecord) => this.formatPath(p));
  }

  /**
   * Get learning path for a specific language/profession combo
   */
  async getLearningPathByLanguageAndProfession(
    learnerId: string,
    language: string,
    profession: string,
  ): Promise<LearningPathResponse | null> {
    const path = await this.prisma.learningPath.findUnique({
      where: {
        learnerId_language_profession: {
          learnerId,
          language,
          profession,
        },
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

  // ========================================================================
  // Private helpers
  // ========================================================================

  private formatPath(path: LearningPathRecord): LearningPathResponse {
    return {
      id: path.id,
      learnerId: path.learnerId,
      language: path.language,
      profession: path.profession,
      status: path.status,
      currentMilestone: path.currentMilestone,
      wordsPerLesson: path.wordsPerLesson,
      startedAt: path.startedAt,
      completedAt: path.completedAt,
      createdAt: path.createdAt,
      updatedAt: path.updatedAt,
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
