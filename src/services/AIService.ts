import { Client as QStashClient } from '@upstash/qstash';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';

export type JobType =
  | 'GENERATE_LESSON'
  | 'GENERATE_STORY'
  | 'GENERATE_EXERCISES'
  | 'GENERATE_AUDIO'
  | 'SCORE_PRONUNCIATION';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AsyncJobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  learnerId?: string | null;
  payload: unknown;
  result?: unknown;
  error?: string | null;
  currentRetry: number;
  maxRetries: number;
  attemptedAt: Date[];
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateLessonJobPayload {
  learningPathId: string;
  learnerId: string;
  language: string;
  profession: string;
  wordsPerLesson: number;
  globalSetId: string;
  milestoneId: string;
  baseLanguage: string;
  excludeWords: string[];
}

export interface GenerateStoryJobPayload {
  learnerId: string;
  milestoneId: string;
  vocabulary: Array<{
    word: string;
    translation: string;
  }>;
  profession: string;
  language: string;
}

export interface GenerateExercisesJobPayload {
  learnerId: string;
  milestoneId: string;
  language: string;
  profession: string;
  vocabulary: string[];
}

export type JobPayload =
  | GenerateLessonJobPayload
  | GenerateStoryJobPayload
  | GenerateExercisesJobPayload
  | Record<string, unknown>;

export interface QueuedJobResult {
  jobId: string;
  type: JobType;
  status: JobStatus;
}

export class AIService {
  private prisma: PrismaClient;
  private qstash: QStashClient;
  private logger: SimpleLogger;
  private webookBaseUrl: string;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('AIService');

    const qstashToken = process.env.UPSTASH_QSTASH_TOKEN;
    if (!qstashToken) {
      throw new Error('UPSTASH_QSTASH_TOKEN is not configured');
    }

    this.qstash = new QStashClient({ token: qstashToken });
    this.webookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Queue a lesson generation job
   * Async job: Claude generates N words for the lesson
   */
  async queueGenerateLesson(payload: GenerateLessonJobPayload): Promise<QueuedJobResult> {
    const job = await this.prisma.asyncJob.create({
      data: {
        type: 'GENERATE_LESSON',
        status: 'PENDING',
        learnerId: payload.learnerId,
        payload: this.toJsonValue(payload),
      },
    });

    try {
      // Send to QStash
      await this.qstash.publishJSON({
        url: `${this.webookBaseUrl}/jobs/generate-lesson`,
        body: {
          jobId: job.id,
          payload,
        },
      });

      this.logger.info(`Queued lesson generation: ${job.id}`);

      return {
        jobId: job.id,
        type: 'GENERATE_LESSON',
        status: 'PENDING',
      };
    } catch (error) {
      // Mark job as failed
      await this.prisma.asyncJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw AppError.internal('Failed to queue lesson generation job');
    }
  }

  /**
   * Queue a story generation job
   * Async job: Claude generates story + comprehension questions
   */
  async queueGenerateStory(payload: GenerateStoryJobPayload): Promise<QueuedJobResult> {
    const job = await this.prisma.asyncJob.create({
      data: {
        type: 'GENERATE_STORY',
        status: 'PENDING',
        learnerId: payload.learnerId,
        payload: this.toJsonValue(payload),
      },
    });

    try {
      await this.qstash.publishJSON({
        url: `${this.webookBaseUrl}/jobs/generate-story`,
        body: {
          jobId: job.id,
          payload,
        },
      });

      this.logger.info(`Queued story generation: ${job.id}`);

      return {
        jobId: job.id,
        type: 'GENERATE_STORY',
        status: 'PENDING',
      };
    } catch (error) {
      await this.prisma.asyncJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw AppError.internal('Failed to queue story generation job');
    }
  }

  /**
   * Queue audio generation for pronunciation exercises
   */
  async queueGenerateExercises(payload: GenerateExercisesJobPayload): Promise<QueuedJobResult> {
    const job = await this.prisma.asyncJob.create({
      data: {
        type: 'GENERATE_EXERCISES',
        status: 'PENDING',
        learnerId: payload.learnerId,
        payload: this.toJsonValue(payload),
      },
    });

    try {
      await this.qstash.publishJSON({
        url: `${this.webookBaseUrl}/jobs/generate-exercises`,
        body: {
          jobId: job.id,
          payload,
        },
      });

      this.logger.info(`Queued exercises generation: ${job.id}`);

      return {
        jobId: job.id,
        type: 'GENERATE_EXERCISES',
        status: 'PENDING',
      };
    } catch (error) {
      await this.prisma.asyncJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw AppError.internal('Failed to queue exercises generation job');
    }
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<AsyncJobRecord> {
    const job = await this.prisma.asyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw AppError.notFound('Job not found');
    }

    return job;
  }

  /**
   * Get jobs for a learner
   */
  async getLearnerJobs(
    learnerId: string,
    limit = 10,
  ): Promise<{ jobs: AsyncJobRecord[]; total: number }> {
    const [jobs, total] = await Promise.all([
      this.prisma.asyncJob.findMany({
        where: { learnerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.asyncJob.count({
        where: { learnerId },
      }),
    ]);

    return { jobs, total };
  }

  /**
   * Update job status to PROCESSING
   */
  async markProcessing(jobId: string): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING' as JobStatus,
        attemptedAt: {
          push: new Date(),
        },
      },
    });

    this.logger.debug(`Marked job as processing: ${jobId}`);
  }

  /**
   * Mark job as completed with result
   */
  async markCompleted(jobId: string, result: Record<string, unknown>): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED' as JobStatus,
        result: this.toJsonValue(result),
        completedAt: new Date(),
      },
    });

    this.logger.info(`Job completed: ${jobId}`);
  }

  /**
   * Mark job as failed with error
   */
  async markFailed(jobId: string, error: string, shouldRetry = true): Promise<void> {
    const job = await this.prisma.asyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw AppError.notFound('Job not found');
    }

    const shouldRetryAgain = shouldRetry && job.currentRetry < job.maxRetries;

    if (shouldRetryAgain) {
      this.logger.warn(
        `Job failed, will retry: ${jobId} (attempt ${job.currentRetry + 1}/${job.maxRetries})`,
      );
      await this.prisma.asyncJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING' as JobStatus,
          currentRetry: job.currentRetry + 1,
          error,
          attemptedAt: {
            push: new Date(),
          },
        },
      });
    } else {
      this.logger.error(`Job failed permanently: ${jobId} - ${error}`);
      await this.prisma.asyncJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED' as JobStatus,
          error,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Cleanup old completed/failed jobs (maintenance)
   */
  async cleanupOldJobs(daysOld = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.asyncJob.deleteMany({
      where: {
        completedAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['COMPLETED', 'FAILED'],
        },
      },
    });

    this.logger.info(`Cleaned up ${result.count} old jobs`);

    return result.count;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue;
  }
}
