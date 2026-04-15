import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';
import { MasterySignals } from '../types';
import { LearningService } from './LearningService';
import { VocabularyService } from './VocabularyService';

type DecimalLike = number | { toString(): string };

interface LearnerWordStateRecord {
  id: string;
  learningPathId: string;
  wordId: string;
  status: 'ACTIVE' | 'LOCKED' | 'MASTERED';
  masteryScore: DecimalLike;
  meaningSeen: boolean;
  usageCompleted: boolean;
  pronunciationScore: DecimalLike;
  attemptCount: number;
  lastAttemptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const recordAttemptSchema = z.object({
  wordId: z.string().min(1, 'Invalid word ID'),
  learningPathId: z.string().min(1, 'Invalid learning path ID'),
  usageAccuracy: z.number().min(0).max(10).optional(), // 0-10 from phrase/sentence exercises
  pronunciationScore: z.number().min(0).max(10).optional(), // 0-10 from ElevenLabs
  responseTime: z.number().positive().optional(), // ms
});

export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;

export interface ProgressStats {
  totalWords: number;
  activeWords: number;
  masteredWords: number;
  averageMasteryScore: number;
  estimatedCompletion: string; // ISO date
}

export class ProgressService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;
  private learningService: LearningService;
  private vocabularyService: VocabularyService;

  // Mastery calculation weights
  private readonly WEIGHTS = {
    usageAccuracy: 0.5, // 50%
    pronunciationAccuracy: 0.3, // 30%
    responseSpeed: 0.2, // 20%
  };

  private readonly MASTERY_THRESHOLD = 8.0;
  private readonly MAX_RESPONSE_TIME = 30000; // 30 seconds = max speed bonus

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('ProgressService');
    this.learningService = new LearningService(prisma);
    this.vocabularyService = new VocabularyService(prisma);
  }

  /**
   * Record attempt and calculate mastery score
   * Called after learner completes word exercises
   */
  async recordAttempt(input: RecordAttemptInput): Promise<LearnerWordStateRecord> {
    const wordState = await this.prisma.learnerWordState.findUnique({
      where: {
        learningPathId_wordId: {
          learningPathId: input.learningPathId,
          wordId: input.wordId,
        },
      },
      include: {
        word: { select: { tags: true } },
      },
    });

    if (!wordState) {
      throw AppError.notFound('Word not found in learner window');
    }

    // Calculate new mastery score
    const signals: MasterySignals = {
      usageAccuracy: input.usageAccuracy ?? Number(wordState.masteryScore),
      pronunciationAccuracy: input.pronunciationScore ?? Number(wordState.pronunciationScore),
      responseSpeed: input.responseTime ? this.calculateSpeedScore(input.responseTime) : 10, // default to perfect
    };

    const newMasteryScore = this.calculateMasteryScore(signals);
    const isMastered = newMasteryScore >= this.MASTERY_THRESHOLD;
    const becameMastered = wordState.status !== 'MASTERED' && isMastered;

    // Update word state
    const updated = await this.prisma.learnerWordState.update({
      where: { id: wordState.id },
      data: {
        masteryScore: newMasteryScore,
        pronunciationScore: input.pronunciationScore ?? wordState.pronunciationScore,
        usageCompleted: input.usageAccuracy ? true : wordState.usageCompleted,
        status: isMastered ? 'MASTERED' : wordState.status,
        attemptCount: wordState.attemptCount + 1,
        lastAttemptedAt: new Date(),
      },
    });

    this.logger.info(
      `Recorded attempt for word ${input.wordId}: mastery ${newMasteryScore.toFixed(2)}/10 (isMastered: ${isMastered})`,
    );

    if (becameMastered) {
      // Find the subcategory ID from the tags
      let subcategoryId: string | null = null;
      if (Array.isArray(wordState.word.tags)) {
        const subcatTag = wordState.word.tags.find((tag: any) => typeof tag === 'string' && tag.startsWith('subcategory:'));
        if (subcatTag) {
          subcategoryId = (subcatTag as string).split(':')[1] || null;
        }
      }

      // If we found a subcategory, increment its completion count
      if (subcategoryId) {
        await this.prisma.subcategoryProgress.update({
          where: {
            learningPathId_subcategoryId: {
              learningPathId: input.learningPathId,
              subcategoryId,
            },
          },
          data: {
            wordsCompleted: { increment: 1 },
          },
        }).catch(err => {
           this.logger.error(`Failed to increment subcategory progress: ${err.message}`);
        });
      }
    }

    // If word just crossed mastery threshold, check whether milestone 1 sprint is complete
    if (becameMastered) {
      await this.vocabularyService.promoteNextWord(input.learningPathId).catch((err) => {
        this.logger.error(
          `Window refill failed for path ${input.learningPathId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

      // Refill logic: Check if we need to generate more words
      await this.triggerRefillIfEmpty(input.learningPathId);

      await this.checkMilestone1Completion(input.learningPathId).catch((err) => {
        this.logger.error(
          `Milestone advancement check failed for path ${input.learningPathId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }

    return updated;
  }

  private async triggerRefillIfEmpty(learningPathId: string): Promise<void> {
    const queueThreshold = 5; // e.g., if there are 5 or fewer words locked
    const lockedCount = await this.prisma.learnerWordState.count({
      where: { learningPathId, status: 'LOCKED' },
    });

    if (lockedCount <= queueThreshold) {
      this.logger.info(`Locked queue low (${lockedCount} left). Checking for refill on path ${learningPathId}...`);
      // We need to trigger the generation controller or service, but ProgressService currently
      // doesn't inject AIService to avoid circular deps. The safest way is to call LearningService 
      // or implement a generic event trigger.
      // Wait: Since ProgressService already has LearningService, we can add a trigger in LearningService.
      await this.learningService.triggerLessonReplenishment(learningPathId).catch(err => {
         this.logger.error(`Replenishment failed: ${err.message}`);
      });
    }
  }

  /**
   * Check if Milestone 1 (Vocabulary Sprint) has reached the 500-word target.
   * If so, automatically advance the path to Milestone 2.
   * Only runs when the path is still on milestone 1 to avoid double-advances.
   */
  private async checkMilestone1Completion(learningPathId: string): Promise<void> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: learningPathId },
      select: { currentMilestone: true },
    });

    if (!path || path.currentMilestone !== 1) return;

    const allSubcategoryProgress = await this.prisma.subcategoryProgress.findMany({
      where: { learningPathId },
      select: {
        wordsCompleted: true,
        wordsTotal: true,
      },
    });

    if (allSubcategoryProgress.length === 0) return;

    let totalCompleted = 0;
    let totalAssigned = 0;
    for (const sub of allSubcategoryProgress) {
      totalCompleted += sub.wordsCompleted;
      totalAssigned += sub.wordsTotal;
    }

    // We consider Milestone 1 complete when 100% of the allocated 500 words across
    // all subcategories are mastered (or if they somehow completed more).
    if (totalAssigned > 0 && totalCompleted >= totalAssigned) {
      await this.learningService.advanceToNextMilestone(learningPathId);
      this.logger.info(
        `Auto-advanced path ${learningPathId} to milestone 2 — ${totalCompleted}/${totalAssigned} words mastered across entire profession`,
      );
    }
  }

  /**
   * Calculate mastery score from multiple signals
   * Formula: (usageAccuracy * 0.5) + (pronunciationAccuracy * 0.3) + (responseSpeed * 0.2)
   */
  private calculateMasteryScore(signals: MasterySignals): number {
    const score =
      signals.usageAccuracy * this.WEIGHTS.usageAccuracy +
      signals.pronunciationAccuracy * this.WEIGHTS.pronunciationAccuracy +
      signals.responseSpeed * this.WEIGHTS.responseSpeed;

    return Math.round(score * 100) / 100; // Round to 2 decimals
  }

  /**
   * Calculate speed score (0-10)
   * Perfect (instant) = 10, 30s or more = 0
   */
  private calculateSpeedScore(responseTimeMs: number): number {
    if (responseTimeMs <= 1000) return 10; // 1 second = perfect
    if (responseTimeMs >= this.MAX_RESPONSE_TIME) return 0;

    // Linear interpolation: 10 -> 0 over MAX_RESPONSE_TIME
    return Math.round((1 - responseTimeMs / this.MAX_RESPONSE_TIME) * 10 * 100) / 100;
  }

  /**
   * Get progress stats for a learning path
   */
  async getProgressStats(learningPathId: string): Promise<ProgressStats> {
    const stats = await this.prisma.learnerWordState.aggregate({
      where: { learningPathId },
      _count: true,
      _avg: { masteryScore: true },
    });

    const [active, mastered] = await Promise.all([
      this.prisma.learnerWordState.count({
        where: { learningPathId, status: 'ACTIVE' },
      }),
      this.prisma.learnerWordState.count({
        where: { learningPathId, status: 'MASTERED' },
      }),
    ]);

    const totalWords = stats._count;
    const averageMasteryScore = stats._avg.masteryScore ? Number(stats._avg.masteryScore) : 0;

    // Estimate completion based on current pace
    // Rough estimate: if mastery is 50%, assume 50% more time needed
    let estimatedDaysRemaining = 0;
    if (averageMasteryScore > 0) {
      estimatedDaysRemaining = Math.ceil((this.MASTERY_THRESHOLD / averageMasteryScore - 1) * 7); // Assume 7 days current pace
    } else {
      estimatedDaysRemaining = 30; // Default estimate
    }

    const estimatedCompletion = new Date();
    estimatedCompletion.setDate(estimatedCompletion.getDate() + estimatedDaysRemaining);

    return {
      totalWords,
      activeWords: active,
      masteredWords: mastered,
      averageMasteryScore,
      estimatedCompletion: estimatedCompletion.toISOString(),
    };
  }

  /**
   * Get mastery breakdown for all words in a path
   */
  async getMasteryBreakdown(learningPathId: string): Promise<{
    byScore: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const words = await this.prisma.learnerWordState.findMany({
      where: { learningPathId },
      select: { masteryScore: true, status: true },
    });

    // Bucket by score: 0-2, 2-4, 4-6, 6-8, 8-10
    const byScore: Record<string, number> = {
      '0-2': 0,
      '2-4': 0,
      '4-6': 0,
      '6-8': 0,
      '8-10': 0,
    };

    const byStatus: Record<string, number> = {
      ACTIVE: 0,
      LOCKED: 0,
      MASTERED: 0,
    };

    words.forEach((word) => {
      const score = Number(word.masteryScore);
      if (score < 2) byScore['0-2']++;
      else if (score < 4) byScore['2-4']++;
      else if (score < 6) byScore['4-6']++;
      else if (score < 8) byScore['6-8']++;
      else byScore['8-10']++;

      byStatus[word.status]++;
    });

    return { byScore, byStatus };
  }

  /**
   * Get learner's daily activity summary
   */
  async getDailyActivity(learningPathId: string, daysBack = 7): Promise<Record<string, number>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const attempts = await this.prisma.learnerWordState.findMany({
      where: {
        learningPathId,
        lastAttemptedAt: {
          gte: startDate,
        },
      },
      select: { lastAttemptedAt: true },
    });

    const activity: Record<string, number> = {};

    attempts.forEach((attempt: { lastAttemptedAt: Date | null }) => {
      if (attempt.lastAttemptedAt) {
        const date = attempt.lastAttemptedAt.toISOString().split('T')[0]; // YYYY-MM-DD
        activity[date] = (activity[date] ?? 0) + 1;
      }
    });

    return activity;
  }

  /**
   * Get top words by mastery score (for insights)
   */
  async getTopWords(learningPathId: string, limit = 10): Promise<unknown[]> {
    return this.prisma.learnerWordState.findMany({
      where: { learningPathId },
      orderBy: { masteryScore: 'desc' },
      take: limit,
      select: {
        wordId: true,
        word: { select: { word: true } },
        masteryScore: true,
        status: true,
      },
    });
  }

  /**
   * Get words needing most work (lowest mastery)
   */
  async getWordsMostNeedingWork(learningPathId: string, limit = 10): Promise<unknown[]> {
    return this.prisma.learnerWordState.findMany({
      where: {
        learningPathId,
        status: { in: ['ACTIVE', 'LOCKED'] },
      },
      orderBy: { masteryScore: 'asc' },
      take: limit,
      select: {
        wordId: true,
        word: { select: { word: true } },
        masteryScore: true,
        status: true,
        attemptCount: true,
      },
    });
  }

  /**
   * Reset progress for a word (for remediation)
   */
  async resetWordProgress(learningPathId: string, wordId: string): Promise<LearnerWordStateRecord> {
    const wordState = await this.prisma.learnerWordState.findUnique({
      where: {
        learningPathId_wordId: {
          learningPathId,
          wordId,
        },
      },
    });

    if (!wordState) {
      throw AppError.notFound('Word not found');
    }

    const reset = await this.prisma.learnerWordState.update({
      where: { id: wordState.id },
      data: {
        masteryScore: 0,
        pronunciationScore: 0,
        usageCompleted: false,
        meaningSeen: false,
        attemptCount: 0,
        status: 'ACTIVE',
        lastAttemptedAt: null,
      },
    });

    this.logger.info(`Reset progress for word ${wordId}`);

    return reset;
  }

  /**
   * Get milestone progress percentage
   * For Milestone 1: uses active subcategory allocation.
   */
  async getMilestoneProgress(learningPathId: string, milestoneNumber: 1 | 2 | 3): Promise<{
    progress: number;
    masteredWords: number;
    targetWords: number;
  }> {
    if (milestoneNumber === 1) {
      const subcategoryProgresses = await this.prisma.subcategoryProgress.findMany({
        where: { learningPathId },
        select: {
          wordsCompleted: true,
          wordsTotal: true,
        },
      });

      if (subcategoryProgresses.length === 0) {
        return { progress: 0, masteredWords: 0, targetWords: 0 };
      }

      const masteredWords = subcategoryProgresses.reduce((sum, sp) => sum + sp.wordsCompleted, 0);
      const targetWords = subcategoryProgresses.reduce((sum, sp) => sum + sp.wordsTotal, 0);
      const progress = targetWords > 0 ? Math.min((masteredWords / targetWords) * 100, 100) : 0;

      return { progress, masteredWords, targetWords };
    }

    // For M2 and M3, progress is tracked through story responses and pronunciation attempts
    // This is a simplified version - would need story/pronunciation specific logic
    return { progress: 0, masteredWords: 0, targetWords: 0 };
  }
}
