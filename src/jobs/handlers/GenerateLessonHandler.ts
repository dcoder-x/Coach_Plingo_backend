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
      const subcategoryTag = this.vocabularyService.getSubcategoryTag(payload.currentSubcategoryId);
      const unusedWords = await this.vocabularyService.getUnusedWordsForSubcategoryFromGlobalSet(
        payload.globalSetId,
        payload.learningPathId,
        payload.wordsPerLesson,
        payload.currentSubcategoryId,
        payload.excludeWords,
      );

      const selectedWords = [...unusedWords];

      if (selectedWords.length < payload.wordsPerLesson) {
        const generatedWords = await this.claudeClient.generateLessonWords({
          profession: payload.profession,
          language: payload.language,
          currentSubcategory: {
            id: payload.currentSubcategoryId,
            name: payload.currentSubcategoryName,
            description: payload.currentSubcategoryDescription,
          },
          allSubcategories: payload.subcategories,
          count: payload.wordsPerLesson - selectedWords.length,
          excludeWords: [...payload.excludeWords, ...selectedWords.map((word) => word.word)],
        });

        const normalizedNameToId = new Map(
          payload.subcategories.map((subcategory) => [subcategory.name.trim().toLowerCase(), subcategory.id]),
        );

        const validGeneratedWords = generatedWords
          .map((word) => {
            const resolvedSubcategoryId = normalizedNameToId.get(word.subcategory.trim().toLowerCase());
            if (!resolvedSubcategoryId || resolvedSubcategoryId !== payload.currentSubcategoryId) {
              return null;
            }

            return {
              ...word,
              resolvedSubcategoryId,
            };
          })
          .filter((word): word is NonNullable<typeof word> => word !== null);

        const persistedWords = await this.vocabularyService.addWordsToGlobalSet(
          payload.globalSetId,
          validGeneratedWords.map<WordData>((word) => ({
            word: word.word,
            complexityLevel: word.complexityLevel,
            examplePhrases: word.examplePhrases,
            exampleSentences: word.exampleSentences,
            tags: Array.from(new Set([...(word.tags || []), subcategoryTag])),
          })),
        );

        for (const persistedWord of persistedWords) {
          const generated = validGeneratedWords.find(
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

        selectedWords.push(
          ...persistedWords.filter((word) => this.vocabularyService.wordHasSubcategory(word.tags, payload.currentSubcategoryId)),
        );
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
      const shouldRetry = ClaudeClient.isRetriableError(error);
      await this.aiService.markFailed(jobId, message, shouldRetry);
      await this.notificationService.notifyError(payload.learnerId, 'Lesson generation failed.');
      throw error;
    }
  }
}
