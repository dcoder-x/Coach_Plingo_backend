import { PrismaClient } from '@prisma/client';
import { AIService, GenerateStoryJobPayload } from '../../services/AIService';
import { NotificationService } from '../../services/NotificationService';
import { ClaudeClient } from '../clients/ClaudeClient';
import { SimpleLogger } from '../../utils/Logger';

export class GenerateStoryHandler {
  private readonly aiService: AIService;
  private readonly notificationService: NotificationService;
  private readonly claudeClient: ClaudeClient;
  private readonly logger: SimpleLogger;

  constructor(private readonly prisma: PrismaClient) {
    this.aiService = new AIService(prisma);
    this.notificationService = new NotificationService(prisma);
    this.claudeClient = new ClaudeClient();
    this.logger = new SimpleLogger('GenerateStoryHandler');
  }

  async handle(jobId: string, payload: GenerateStoryJobPayload): Promise<Record<string, unknown>> {
    await this.aiService.markProcessing(jobId);

    try {
      const story = await this.claudeClient.generateStory({
        language: payload.language,
        profession: payload.profession,
        vocabulary: payload.vocabulary,
      });

      const savedStory = await this.prisma.story.upsert({
        where: { milestoneId: payload.milestoneId },
        update: {
          content: story.content,
          vocabularyCoverage: story.vocabularyCoverage,
          status: 'PUBLISHED',
        },
        create: {
          milestoneId: payload.milestoneId,
          content: story.content,
          vocabularyCoverage: story.vocabularyCoverage,
          status: 'PUBLISHED',
        },
      });

      await this.prisma.comprehensionQuestion.deleteMany({
        where: { storyId: savedStory.id },
      });

      if (story.questions.length > 0) {
        await this.prisma.comprehensionQuestion.createMany({
          data: story.questions.map((question) => ({
            storyId: savedStory.id,
            questionText: question.questionText,
            options: question.options,
            correctAnswer: question.correctAnswer,
            questionType: question.questionType,
            position: question.position,
          })),
        });
      }

      await this.notificationService.createNotification({
        learnerId: payload.learnerId,
        type: 'LESSON_AVAILABLE',
        title: 'Comprehension Story Ready',
        message: 'Your new comprehension story and questions are ready.',
        metadata: { milestoneId: payload.milestoneId, storyId: savedStory.id },
      });

      const result = {
        milestoneId: payload.milestoneId,
        storyId: savedStory.id,
        questionCount: story.questions.length,
      };

      await this.aiService.markCompleted(jobId, result);
      this.logger.info(`Story job completed: ${jobId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown story job error';
      await this.aiService.markFailed(jobId, message, false);
      await this.notificationService.notifyError(payload.learnerId, 'Story generation failed.');
      throw error;
    }
  }
}
