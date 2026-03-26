import { PrismaClient } from '@prisma/client';
import { AIService, GenerateLessonJobPayload } from '../../services/AIService';
import { LearningService } from '../../services/LearningService';
import { NotificationService } from '../../services/NotificationService';
import { VocabularyService, WordData } from '../../services/VocabularyService';
import { ClaudeClient } from '../clients/ClaudeClient';
import { AppError } from '../../utils/AppError';
import { SimpleLogger } from '../../utils/Logger';

export class GenerateLessonHandler {
  private readonly aiService: AIService;
  private readonly learningService: LearningService;
  private readonly notificationService: NotificationService;
  private readonly vocabularyService: VocabularyService;
  private readonly claudeClient: ClaudeClient;
  private readonly logger: SimpleLogger;

  constructor(prisma: PrismaClient) {
    this.aiService = new AIService(prisma);
    this.learningService = new LearningService(prisma);
    this.notificationService = new NotificationService(prisma);
    this.vocabularyService = new VocabularyService(prisma);
    this.claudeClient = new ClaudeClient();
    this.logger = new SimpleLogger('GenerateLessonHandler');
  }

  async handle(jobId: string, payload: GenerateLessonJobPayload): Promise<Record<string, unknown>> {
    await this.aiService.markProcessing(jobId);

    try {
      const unusedWords = await this.vocabularyService.getUnusedWordsFromGlobalSet(
        payload.globalSetId,
        payload.learningPathId,
        payload.wordsPerLesson,
        payload.excludeWords,
      );

      const selectedWords = [...unusedWords];

      if (selectedWords.length < payload.wordsPerLesson) {
        const generatedWords = await this.claudeClient.generateLessonWords({
          profession: payload.profession,
          language: payload.language,
          count: payload.wordsPerLesson - selectedWords.length,
          excludeWords: [...payload.excludeWords, ...selectedWords.map((word) => word.word)],
        });

        const persistedWords = await this.vocabularyService.addWordsToGlobalSet(
          payload.globalSetId,
          generatedWords.map<WordData>((word) => ({
            word: word.word,
            complexityLevel: word.complexityLevel,
            examplePhrases: word.examplePhrases,
            exampleSentences: word.exampleSentences,
            tags: word.tags,
          })),
        );

        for (const persistedWord of persistedWords) {
          const generated = generatedWords.find(
            (word) => word.word.toLowerCase() === persistedWord.word.toLowerCase(),
          );

          if (generated) {
            await this.vocabularyService.addTranslation(
              persistedWord.id,
              payload.baseLanguage,
              generated.translation,
            );
          }
        }

        selectedWords.push(...persistedWords);
      }

      const wordsForLesson = selectedWords.slice(0, payload.wordsPerLesson);
      if (wordsForLesson.length === 0) {
        throw AppError.internal('No lesson vocabulary could be produced');
      }

      await this.vocabularyService.assignWordsToLearner(payload.learningPathId, wordsForLesson);
      await this.learningService.updateGeneratedWords(
        payload.milestoneId,
        wordsForLesson.map((word) => word.word),
      );

      const activeBefore = await this.vocabularyService.getActiveWindowSize(payload.learningPathId);
      const slotsToFill = Math.max(0, Math.min(wordsForLesson.length, 20 - activeBefore));
      let promotedCount = 0;

      for (let index = 0; index < slotsToFill; index += 1) {
        const promotion = await this.vocabularyService.promoteNextWord(payload.learningPathId);
        if (promotion.promoted) {
          promotedCount += 1;
        }
      }

      await this.notificationService.notifyLessonAvailable(payload.learnerId);

      const result = {
        learningPathId: payload.learningPathId,
        assignedWords: wordsForLesson.length,
        promotedWords: promotedCount,
        generatedWords: wordsForLesson.map((word) => word.word),
      };

      await this.aiService.markCompleted(jobId, result);
      this.logger.info(`Lesson job completed: ${jobId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown lesson job error';
      await this.aiService.markFailed(jobId, message, false);
      await this.notificationService.notifyError(payload.learnerId, 'Lesson generation failed.');
      throw error;
    }
  }
}
