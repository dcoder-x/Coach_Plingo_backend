import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';

type DecimalLike = number | { toString(): string };

interface VocabularyAudioCacheRecord {
  id: string;
  wordId: string;
  language: string;
  audioUrl: string;
  ipa?: string | null;
  generatedAt: Date;
  updatedAt: Date;
}

interface PronunciationAttemptRecord {
  id: string;
  exerciseId: string | null;
  wordId: string | null;
  learnerId: string;
  recordedAudioUrl: string;
  accuracyScore: DecimalLike;
  passed: boolean;
  attemptedAt: Date;
  updatedAt: Date;
}

export interface PronunciationAttemptInput {
  exerciseId?: string | null;
  wordId?: string | null;
  learnerId: string;
  recordedAudioUrl: string;
  accuracyScore: number; // 0-100 continuous score
}

export interface AudioCacheData {
  wordId: string;
  language: string;
  audioUrl: string;
  ipa?: string;
}

export class PronunciationService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('PronunciationService');
  }

  /**
   * Get cached audio for a word
   * Cache key: (word_id, language) - one ElevenLabs call per word, ever
   */
  async getCachedAudio(wordId: string, language: string): Promise<VocabularyAudioCacheRecord | null> {
    const cached = await this.prisma.vocabularyAudioCache.findFirst({
      where: {
        wordId,
        language,
      },
    });

    if (cached) {
      this.logger.debug(`Audio cache hit for word ${wordId}`);
    }

    return cached;
  }

  /**
   * Cache audio after generation from ElevenLabs
   * Permanent storage - never deleted or regenerated
   */
  async cacheAudio(data: AudioCacheData): Promise<VocabularyAudioCacheRecord> {
    // Check if already cached
    const existing = await this.getCachedAudio(data.wordId, data.language);
    if (existing) {
      return existing;
    }

    const cached = await this.prisma.vocabularyAudioCache.create({
      data: {
        wordId: data.wordId,
        language: data.language,
        audioUrl: data.audioUrl,
        ipa: data.ipa,
      },
    });

    this.logger.info(`Cached audio for word ${data.wordId} (${data.language})`);

    return cached;
  }

  /**
   * Record pronunciation attempt
   * Called after learner records and submits their pronunciation
   */
  async recordAttempt(input: PronunciationAttemptInput): Promise<PronunciationAttemptRecord> {
    if (!input.exerciseId && !input.wordId) {
      throw AppError.badRequest('Either exerciseId or wordId is required');
    }

    if (input.exerciseId) {
      const exercise = await this.prisma.pronunciationExercise.findUnique({
        where: { id: input.exerciseId },
      });

      if (!exercise) {
        throw AppError.notFound('Pronunciation exercise not found');
      }
    }

    if (input.wordId) {
      const word = await this.prisma.scenarioWord.findUnique({
        where: { id: input.wordId },
      });

      if (!word) {
        throw AppError.notFound('Scenario word not found');
      }
    }

    const accuracyScore = Math.max(0, Math.min(100, Math.round(input.accuracyScore * 100) / 100));
    const passed = accuracyScore >= 70;

    const attempt = await this.prisma.pronunciationAttempt.create({
      data: {
        exerciseId: input.exerciseId ?? null,
        wordId: input.wordId ?? null,
        learnerId: input.learnerId,
        recordedAudioUrl: input.recordedAudioUrl,
        accuracyScore,
        passed,
      },
    });

    this.logger.info(
      `Recorded pronunciation attempt - exercise: ${input.exerciseId || 'n/a'}, word: ${input.wordId || 'n/a'}, accuracy: ${accuracyScore}/100 (passed: ${passed})`,
    );

    return attempt;
  }

  /**
   * Get pronunciation attempts for an exercise
   */
  async getAttempts(exerciseId: string): Promise<PronunciationAttemptRecord[]> {
    return this.prisma.pronunciationAttempt.findMany({
      where: { exerciseId },
      orderBy: { attemptedAt: 'desc' },
    });
  }

  /**
   * Get best attempt for an exercise
   */
  async getBestAttempt(exerciseId: string): Promise<PronunciationAttemptRecord | null> {
    return this.prisma.pronunciationAttempt.findFirst({
      where: { exerciseId },
      orderBy: { accuracyScore: 'desc' },
    });
  }

  /**
   * Get pronunciation milestone progress
   */
  async getMilestoneProgress(milestoneId: string): Promise<{
    totalExercises: number;
    passedExercises: number;
    isComplete: boolean;
  }> {
    const exercises = await this.prisma.pronunciationExercise.findMany({
      where: { milestoneId },
      include: {
        attempts: {
          orderBy: { attemptedAt: 'desc' },
          take: 1, // Only latest attempt
        },
      },
    });

    const passedExercises = exercises.filter((ex: { attempts: Array<{ passed: boolean }> }) => ex.attempts.length > 0 && ex.attempts[0].passed)
      .length;

    const isComplete = passedExercises === exercises.length && exercises.length > 0;

    return {
      totalExercises: exercises.length,
      passedExercises,
      isComplete,
    };
  }

  /**
   * Get learner's pronunciation stats
   */
  async getLearnerStats(learnerId: string): Promise<{
    totalAttempts: number;
    passedAttempts: number;
    averageAccuracy: number;
    bestAccuracy: number;
  }> {
    const attempts = await this.prisma.pronunciationAttempt.findMany({
      where: { learnerId },
    });

    if (attempts.length === 0) {
      return {
        totalAttempts: 0,
        passedAttempts: 0,
        averageAccuracy: 0,
        bestAccuracy: 0,
      };
    }

    const passedAttempts = attempts.filter((a) => a.passed).length;
    const accuracyScores = attempts.map((a) => Number(a.accuracyScore));
    const averageAccuracy = Math.round(
      (accuracyScores.reduce((a: number, b: number) => a + b, 0) / accuracyScores.length) * 100,
    ) / 100;
    const bestAccuracy = Math.max(...accuracyScores);

    return {
      totalAttempts: attempts.length,
      passedAttempts,
      averageAccuracy,
      bestAccuracy,
    };
  }
}
