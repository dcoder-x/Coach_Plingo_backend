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
  currentSubcategoryId: string;
  currentSubcategoryName: string;
  currentSubcategoryDescription?: string;
  subcategories: Array<{
    id: string;
    name: string;
    description?: string;
    wordAllocation: number;
    position: number;
  }>;
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
  private isProduction: boolean;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('AIService');
    this.isProduction = process.env.NODE_ENV === 'production';

    const qstashToken = process.env.UPSTASH_QSTASH_TOKEN;
    if (!qstashToken) {
      throw new Error('UPSTASH_QSTASH_TOKEN is not configured');
    }

    const qstashBaseUrl =
      process.env.UPSTASH_QSTASH_URL?.trim() ||
      process.env.QSTASH_URL?.trim();

    this.qstash = new QStashClient({
      token: qstashToken,
      ...(qstashBaseUrl ? { baseUrl: qstashBaseUrl } : {}),
    });

    const configuredBaseUrl = process.env.WEBHOOK_BASE_URL?.trim();
    const vercelUrl = process.env.VERCEL_URL?.trim();
    const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();
    const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

    const inferredBaseUrl =
      configuredBaseUrl ||
      (vercelUrl ? `https://${vercelUrl}` : undefined) ||
      renderExternalUrl ||
      (railwayPublicDomain ? `https://${railwayPublicDomain}` : undefined) ||
      'http://localhost:3000';

    this.webookBaseUrl = inferredBaseUrl.replace(/\/+$/, '');

    if (this.isProduction && this.isLocalhostUrl(this.webookBaseUrl)) {
      this.logger.error(
        `Invalid webhook callback base URL in production: ${this.webookBaseUrl}. Set WEBHOOK_BASE_URL to a publicly reachable HTTPS URL.`,
      );
    }
  }

  private isLocalhostUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  private ensureQueueCallbackUrlIsValid(): void {
    if (!this.isProduction) {
      return;
    }

    if (this.isLocalhostUrl(this.webookBaseUrl)) {
      throw new Error(
        `QStash callback URL is localhost in production (${this.webookBaseUrl}). Configure WEBHOOK_BASE_URL to your public API origin.`,
      );
    }
  }

  private getJobWebhookPath(type: JobType): string | null {
    switch (type) {
      case 'GENERATE_LESSON':
        return '/jobs/generate-lesson';
      case 'GENERATE_STORY':
        return '/jobs/generate-story';
      case 'GENERATE_EXERCISES':
        return '/jobs/generate-exercises';
      default:
        return null;
    }
  }

  private getRetryDelaySeconds(nextRetryAttempt: number): number {
    const schedule = [30, 120, 300];
    return schedule[Math.min(nextRetryAttempt - 1, schedule.length - 1)];
  }

  private async publishJob(jobId: string, type: JobType, payload: JobPayload, delaySeconds?: number): Promise<void> {
    this.ensureQueueCallbackUrlIsValid();

    const webhookPath = this.getJobWebhookPath(type);
    if (!webhookPath) {
      throw new Error(`Unsupported job type for queue publish: ${type}`);
    }

    await this.qstash.publishJSON({
      url: `${this.webookBaseUrl}${webhookPath}`,
      body: {
        jobId,
        payload,
      },
      ...(typeof delaySeconds === 'number' ? { delay: delaySeconds } : {}),
    });
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
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      await this.publishJob(job.id, 'GENERATE_LESSON', payload);

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

      this.logger.error(
        `Failed to queue lesson generation job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
      );

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
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      await this.publishJob(job.id, 'GENERATE_STORY', payload);

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

      this.logger.error(
        `Failed to queue story generation job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
      );

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
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      await this.publishJob(job.id, 'GENERATE_EXERCISES', payload);

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

      this.logger.error(
        `Failed to queue exercises generation job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
      );

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
        result: result as Prisma.InputJsonValue,
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

      const nextRetry = job.currentRetry + 1;
      await this.prisma.asyncJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING' as JobStatus,
          currentRetry: nextRetry,
          error,
        },
      });

      try {
        const payload = job.payload as JobPayload;
        const delaySeconds = this.getRetryDelaySeconds(nextRetry);
        await this.publishJob(job.id, job.type, payload, delaySeconds);
      } catch (requeueError) {
        const requeueMessage =
          requeueError instanceof Error ? requeueError.message : 'Unknown queue re-publish error';

        this.logger.error(`Failed to requeue retry for job ${job.id}: ${requeueMessage}`);

        await this.prisma.asyncJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED' as JobStatus,
            error: `${error} | retry_queue_error=${requeueMessage}`,
            completedAt: new Date(),
          },
        });
      }
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
}
