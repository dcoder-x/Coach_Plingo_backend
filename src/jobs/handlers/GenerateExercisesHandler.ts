import { PrismaClient } from '@prisma/client';
import { AIService, GenerateExercisesJobPayload } from '../../services/AIService';
import { NotificationService } from '../../services/NotificationService';
import { ClaudeClient } from '../clients/ClaudeClient';
import { ElevenLabsClient } from '../clients/ElevenLabsClient';
import { SimpleLogger } from '../../utils/Logger';

export class GenerateExercisesHandler {
  private readonly aiService: AIService;
  private readonly notificationService: NotificationService;
  private readonly claudeClient: ClaudeClient;
  private readonly elevenLabsClient: ElevenLabsClient;
  private readonly logger: SimpleLogger;

  constructor(private readonly prisma: PrismaClient) {
    this.aiService = new AIService(prisma);
    this.notificationService = new NotificationService(prisma);
    this.claudeClient = new ClaudeClient();
    this.elevenLabsClient = new ElevenLabsClient();
    this.logger = new SimpleLogger('GenerateExercisesHandler');
  }

  async handle(jobId: string, payload: GenerateExercisesJobPayload): Promise<Record<string, unknown>> {
    await this.aiService.markProcessing(jobId);

    try {
      const exercises = await this.claudeClient.generatePronunciationExercises({
        profession: payload.profession,
        language: payload.language,
        vocabulary: payload.vocabulary,
      });

      await this.prisma.pronunciationExercise.deleteMany({
        where: { milestoneId: payload.milestoneId },
      });

      const createdExercises = [] as Array<{ id: string; targetText: string }>;

      for (const exercise of exercises) {
        const referenceAudioUrl = await this.elevenLabsClient.generateSpeech(exercise.targetText);
        const created = await this.prisma.pronunciationExercise.create({
          data: {
            milestoneId: payload.milestoneId,
            targetText: exercise.targetText,
            referenceAudioUrl,
            complexityLevel: exercise.complexityLevel,
            position: exercise.position,
          },
        });
        createdExercises.push({ id: created.id, targetText: created.targetText });
      }

      await this.notificationService.createNotification({
        learnerId: payload.learnerId,
        type: 'LESSON_AVAILABLE',
        title: 'Pronunciation Practice Ready',
        message: 'New pronunciation exercises are ready to practice.',
        metadata: { milestoneId: payload.milestoneId, exerciseCount: createdExercises.length },
      });

      const result = {
        milestoneId: payload.milestoneId,
        exerciseCount: createdExercises.length,
        exerciseIds: createdExercises.map((exercise) => exercise.id),
      };

      await this.aiService.markCompleted(jobId, result);
      this.logger.info(`Exercises job completed: ${jobId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown exercises job error';
      const shouldRetry = ClaudeClient.isRetriableError(error);
      await this.aiService.markFailed(jobId, message, shouldRetry);
      await this.notificationService.notifyError(payload.learnerId, 'Pronunciation exercise generation failed.');
      throw error;
    }
  }
}
