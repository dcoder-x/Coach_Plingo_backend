import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { ProgressService } from './ProgressService';
import { PronunciationService } from './PronunciationService';
import { CloudinaryService } from './CloudinaryService';
import { ElevenLabsClient } from '../jobs/clients/ElevenLabsClient';
import { AIService } from './AIService';
import { LearningService } from './LearningService';
import { SimpleLogger } from '../utils/Logger';

export const completeCurrentSessionSchema = z
  .object({
    lessonType: z.enum(['VOCABULARY_SPRINT', 'COMPREHENSION', 'PRONUNCIATION_MASTERY']),
    wordResults: z
      .array(
        z.object({
          wordId: z.string().min(1),
          meaningAccuracy: z.number().min(0).max(10).optional(),
          usageAccuracy: z.number().min(0).max(10).optional(),
          pronunciationScore: z.number().min(0).max(10).optional(),
          responseTime: z.number().positive().optional(),
        }),
      )
      .optional(),
    questionResponses: z
      .array(
        z.object({
          questionId: z.string().min(1),
          response: z.string().min(1),
        }),
      )
      .optional(),
    pronunciationResults: z
      .array(
        z.object({
          exerciseId: z.string().min(1),
          recordedAudioUrl: z.string().min(1),
          externalAccuracyScore: z.number().min(0).max(100).optional(),
          transcript: z.string().min(1).optional(),
        }),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.lessonType === 'VOCABULARY_SPRINT' && (!value.wordResults || value.wordResults.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'wordResults are required for vocabulary sprint completion',
        path: ['wordResults'],
      });
    }

    if (value.lessonType === 'COMPREHENSION' && (!value.questionResponses || value.questionResponses.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'questionResponses are required for comprehension completion',
        path: ['questionResponses'],
      });
    }

    if (
      value.lessonType === 'PRONUNCIATION_MASTERY' &&
      (!value.pronunciationResults || value.pronunciationResults.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pronunciationResults are required for pronunciation mastery completion',
        path: ['pronunciationResults'],
      });
    }
  });

type CompleteCurrentSessionInput = z.infer<typeof completeCurrentSessionSchema>;

export class LessonSessionService {
  private readonly prisma: PrismaClient;
  private readonly progressService: ProgressService;
  private readonly pronunciationService: PronunciationService;
  private readonly cloudinaryService: CloudinaryService;
  private readonly elevenLabsClient: ElevenLabsClient;
  private readonly aiService: AIService;
  private readonly learningService: LearningService;
  private readonly logger: SimpleLogger;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.progressService = new ProgressService(prisma);
    this.pronunciationService = new PronunciationService(prisma);
    this.cloudinaryService = new CloudinaryService();
    this.elevenLabsClient = new ElevenLabsClient();
    this.aiService = new AIService(prisma);
    this.learningService = new LearningService(prisma);
    this.logger = new SimpleLogger('LessonSessionService');
  }

  async getCurrentSession(pathId: string, learnerId: string) {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      include: { learner: true },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.learnerId !== learnerId) {
      throw AppError.forbidden('Not authorized');
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
      throw AppError.notFound('Active milestone not found');
    }

    if (path.currentMilestone === 1) {
      return this.buildVocabularySprintSession(pathId, path.language, path.learner.baseLanguage, milestone.id);
    }

    if (path.currentMilestone === 2) {
      return this.buildComprehensionSession(pathId, milestone.id);
    }

    return this.buildPronunciationSession(pathId, milestone.id);
  }

  async completeCurrentSession(pathId: string, learnerId: string, input: CompleteCurrentSessionInput) {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      include: { learner: true },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.learnerId !== learnerId) {
      throw AppError.forbidden('Not authorized');
    }

    if (path.currentMilestone === 1 && input.lessonType !== 'VOCABULARY_SPRINT') {
      throw AppError.badRequest('Current session expects vocabulary sprint completion');
    }
    if (path.currentMilestone === 2 && input.lessonType !== 'COMPREHENSION') {
      throw AppError.badRequest('Current session expects comprehension completion');
    }
    if (path.currentMilestone === 3 && input.lessonType !== 'PRONUNCIATION_MASTERY') {
      throw AppError.badRequest('Current session expects pronunciation mastery completion');
    }

    if (path.currentMilestone === 1) {
      return this.completeVocabularySprint(pathId, learnerId, input.wordResults || []);
    }

    if (path.currentMilestone === 2) {
      return this.completeComprehension(pathId, learnerId, input.questionResponses || []);
    }

    return this.completePronunciationMastery(pathId, learnerId, input.pronunciationResults || []);
  }

  private async buildVocabularySprintSession(
    pathId: string,
    language: string,
    baseLanguage: string,
    milestoneId: string,
  ) {
    const activeStates = await this.prisma.learnerWordState.findMany({
      where: {
        learningPathId: pathId,
        status: 'ACTIVE',
      },
      include: {
        word: {
          include: {
            translations: {
              where: { baseLanguage },
            },
            audioCache: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (activeStates.length === 0) {
      return {
        sessionId: `path:${pathId}:milestone:1`,
        lessonType: 'VOCABULARY_SPRINT',
        status: 'PREPARING',
        ready: false,
        words: [],
        steps: [],
      };
    }

    const words = await Promise.all(
      activeStates.map(async (state, index) => {
        const pronunciationAudioUrl = state.word.audioCache?.audioUrl || (await this.ensureWordAudio(state.wordId, language, state.word.word));

        return {
          index: index + 1,
          wordId: state.wordId,
          text: state.word.word,
          translation:
            state.word.translations.length > 0 ? state.word.translations[0].translation : null,
          pronunciationAudioUrl,
          examplePhrases: this.asStringArray(state.word.examplePhrases),
          exampleSentences: this.asStringArray(state.word.exampleSentences),
          difficulty: state.word.complexityLevel,
          tags: this.asStringArray(state.word.tags),
          masteryScore: Number(state.masteryScore),
          pronunciationScore: Number(state.pronunciationScore),
          status: state.status,
        };
      }),
    );

    const steps = this.buildVocabularySprintSteps(words);
    const progress = await this.progressService.getMilestoneProgress(pathId, 1);

    return {
      sessionId: `path:${pathId}:milestone:1`,
      lessonType: 'VOCABULARY_SPRINT',
      status: 'READY',
      ready: true,
      milestone: {
        id: milestoneId,
        milestoneNumber: 1,
        type: 'VOCABULARY_SPRINT',
      },
      progress,
      words,
      steps,
    };
  }

  private async buildComprehensionSession(pathId: string, milestoneId: string) {
    const story = await this.prisma.story.findUnique({
      where: { milestoneId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!story) {
      return {
        sessionId: `path:${pathId}:milestone:2`,
        lessonType: 'COMPREHENSION',
        status: 'PREPARING',
        ready: false,
      };
    }

    return {
      sessionId: `path:${pathId}:milestone:2`,
      lessonType: 'COMPREHENSION',
      status: 'READY',
      ready: true,
      milestone: {
        id: milestoneId,
        milestoneNumber: 2,
        type: 'COMPREHENSION',
      },
      story: {
        id: story.id,
        content: story.content,
        vocabularyCoverage: this.asStringArray(story.vocabularyCoverage),
        questions: story.questions.map((question) => ({
          questionId: question.id,
          questionText: question.questionText,
          options: this.asStringArray(question.options),
          questionType: question.questionType,
          position: question.position,
        })),
      },
    };
  }

  private async buildPronunciationSession(pathId: string, milestoneId: string) {
    const exercises = await this.prisma.pronunciationExercise.findMany({
      where: { milestoneId },
      orderBy: { position: 'asc' },
    });

    if (exercises.length === 0) {
      return {
        sessionId: `path:${pathId}:milestone:3`,
        lessonType: 'PRONUNCIATION_MASTERY',
        status: 'PREPARING',
        ready: false,
      };
    }

    return {
      sessionId: `path:${pathId}:milestone:3`,
      lessonType: 'PRONUNCIATION_MASTERY',
      status: 'READY',
      ready: true,
      milestone: {
        id: milestoneId,
        milestoneNumber: 3,
        type: 'PRONUNCIATION_MASTERY',
      },
      exercises: exercises.map((exercise) => ({
        exerciseId: exercise.id,
        targetText: exercise.targetText,
        referenceAudioUrl: exercise.referenceAudioUrl,
        complexityLevel: exercise.complexityLevel,
        position: exercise.position,
      })),
    };
  }

  private async completeVocabularySprint(
    pathId: string,
    learnerId: string,
    wordResults: Array<{
      wordId: string;
      meaningAccuracy?: number;
      usageAccuracy?: number;
      pronunciationScore?: number;
      responseTime?: number;
    }>,
  ) {
    const updatedWords = [] as Array<Record<string, unknown>>;

    for (const result of wordResults) {
      const usageScores = [result.meaningAccuracy, result.usageAccuracy].filter(
        (value): value is number => typeof value === 'number',
      );
      const effectiveUsageAccuracy =
        usageScores.length > 0
          ? Math.round((usageScores.reduce((sum, value) => sum + value, 0) / usageScores.length) * 100) / 100
          : undefined;

      const updated = await this.progressService.recordAttempt({
        wordId: result.wordId,
        learningPathId: pathId,
        usageAccuracy: effectiveUsageAccuracy,
        pronunciationScore: result.pronunciationScore,
        responseTime: result.responseTime,
      });

      updatedWords.push({
        wordId: result.wordId,
        masteryScore: Number(updated.masteryScore),
        status: updated.status,
        attemptCount: updated.attemptCount,
      });
    }

    await this.ensureComprehensionPreparation(pathId, learnerId);

    const [progress, nextSession] = await Promise.all([
      this.progressService.getMilestoneProgress(pathId, 1),
      this.getCurrentSession(pathId, learnerId),
    ]);

    return {
      lessonType: 'VOCABULARY_SPRINT',
      completedWords: updatedWords,
      progress,
      nextSession,
    };
  }

  private async ensureComprehensionPreparation(pathId: string, learnerId: string): Promise<void> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      include: { learner: true },
    });

    if (!path || path.currentMilestone !== 2) {
      return;
    }

    const milestone2 = await this.prisma.milestone.findUnique({
      where: {
        learningPathId_milestoneNumber: {
          learningPathId: pathId,
          milestoneNumber: 2,
        },
      },
      select: { id: true },
    });

    if (!milestone2) {
      return;
    }

    const existingStory = await this.prisma.story.findUnique({
      where: { milestoneId: milestone2.id },
      select: { id: true },
    });

    if (existingStory) {
      return;
    }

    const vocabulary = await this.prisma.learnerWordState.findMany({
      where: { learningPathId: pathId },
      include: {
        word: {
          include: {
            translations: {
              where: { baseLanguage: path.learner.baseLanguage },
            },
          },
        },
      },
      take: 12,
    });

    await this.aiService.queueGenerateStory({
      learnerId,
      milestoneId: milestone2.id,
      profession: path.profession,
      language: path.language,
      vocabulary: vocabulary.map((item) => ({
        word: item.word.word,
        translation:
          item.word.translations.length > 0 ? item.word.translations[0].translation : item.word.word,
      })),
    });
  }

  private async completeComprehension(
    pathId: string,
    learnerId: string,
    questionResponses: Array<{ questionId: string; response: string }>,
  ) {
    const milestone = await this.prisma.milestone.findUnique({
      where: {
        learningPathId_milestoneNumber: {
          learningPathId: pathId,
          milestoneNumber: 2,
        },
      },
      select: { id: true },
    });

    if (!milestone) {
      throw AppError.notFound('Comprehension milestone not found');
    }

    const story = await this.prisma.story.findUnique({
      where: { milestoneId: milestone.id },
      include: { questions: true },
    });

    if (!story) {
      throw AppError.notFound('Comprehension story not ready');
    }

    const questionMap = new Map(story.questions.map((question) => [question.id, question]));
    const storedResponses = [] as Array<Record<string, unknown>>;

    for (const item of questionResponses) {
      const question = questionMap.get(item.questionId);
      if (!question) {
        throw AppError.notFound(`Question not found: ${item.questionId}`);
      }

      const isCorrect = this.normalizeText(question.correctAnswer) === this.normalizeText(item.response);
      const stored = await this.prisma.comprehensionResponse.create({
        data: {
          questionId: question.id,
          learnerId,
          response: item.response,
          isCorrect,
        },
      });

      storedResponses.push({
        responseId: stored.id,
        questionId: question.id,
        isCorrect,
      });
    }

    const answeredQuestionIds = new Set(questionResponses.map((item) => item.questionId));
    const allCorrect =
      story.questions.length > 0 &&
      story.questions.every(
        (question) =>
          answeredQuestionIds.has(question.id) &&
          this.normalizeText(question.correctAnswer) ===
            this.normalizeText(
              questionResponses.find((item) => item.questionId === question.id)?.response || '',
            ),
      );

    let nextMilestoneQueuedJobId: string | undefined;
    if (allCorrect) {
      const advancement = await this.learningService.advanceToNextMilestone(pathId);
      const path = await this.prisma.learningPath.findUnique({
        where: { id: pathId },
        include: { learner: true },
      });

      if (advancement.nextMilestone && path) {
        const vocabulary = await this.prisma.learnerWordState.findMany({
          where: { learningPathId: pathId },
          include: {
            word: {
              include: {
                translations: {
                  where: { baseLanguage: path.learner.baseLanguage },
                },
              },
            },
          },
          take: 12,
        });

        const storyJob = await this.aiService.queueGenerateExercises({
          learnerId,
          milestoneId: advancement.nextMilestone.id,
          language: path.language,
          profession: path.profession,
          vocabulary: vocabulary.map((item) => item.word.word),
        });
        nextMilestoneQueuedJobId = storyJob.jobId;
      }
    }

    const nextSession = await this.getCurrentSession(pathId, learnerId);

    return {
      lessonType: 'COMPREHENSION',
      allCorrect,
      responses: storedResponses,
      nextMilestoneQueuedJobId,
      nextSession,
    };
  }

  private async completePronunciationMastery(
    pathId: string,
    learnerId: string,
    pronunciationResults: Array<{
      exerciseId: string;
      recordedAudioUrl: string;
      externalAccuracyScore?: number;
      transcript?: string;
    }>,
  ) {
    const exercises = await this.prisma.pronunciationExercise.findMany({
      where: {
        milestone: {
          learningPathId: pathId,
          milestoneNumber: 3,
        },
      },
      include: {
        milestone: true,
      },
    });

    const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const attempts = [] as Array<Record<string, unknown>>;

    for (const item of pronunciationResults) {
      const exercise = exerciseMap.get(item.exerciseId);
      if (!exercise) {
        throw AppError.notFound(`Pronunciation exercise not found: ${item.exerciseId}`);
      }

      const score100 =
        typeof item.externalAccuracyScore === 'number'
          ? item.externalAccuracyScore
          : this.computeTranscriptAccuracy(exercise.targetText, item.transcript || '');

      const attempt = await this.pronunciationService.recordAttempt({
        exerciseId: exercise.id,
        learnerId,
        recordedAudioUrl: item.recordedAudioUrl,
        accuracyScore: score100,
      });

      attempts.push({
        exerciseId: exercise.id,
        accuracyScore: Number(attempt.accuracyScore),
        passed: attempt.passed,
      });
    }

    const progress = await this.pronunciationService.getMilestoneProgress(exercises[0]?.milestoneId || '');

    let courseCompleted = false;
    if (exercises[0] && progress.isComplete) {
      await this.prisma.learningPath.update({
        where: { id: pathId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      await this.prisma.milestone.update({
        where: {
          learningPathId_milestoneNumber: {
            learningPathId: pathId,
            milestoneNumber: 3,
          },
        },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      courseCompleted = true;
    }

    return {
      lessonType: 'PRONUNCIATION_MASTERY',
      attempts,
      progress,
      courseCompleted,
    };
  }

  private buildVocabularySprintSteps(
    words: Array<{
      wordId: string;
      text: string;
      translation: string | null;
      pronunciationAudioUrl: string;
      exampleSentences: string[];
    }>,
  ) {
    const steps = [] as Array<Record<string, unknown>>;

    words.forEach((word, index) => {
      steps.push({
        stepId: `${word.wordId}:intro`,
        type: 'INTRODUCE_WORD',
        wordId: word.wordId,
        prompt: `Learn the word ${word.text}`,
        audioUrl: word.pronunciationAudioUrl,
        order: steps.length + 1,
      });

      steps.push({
        stepId: `${word.wordId}:pronounce`,
        type: 'PRONOUNCE_WORD',
        wordId: word.wordId,
        prompt: `Pronounce ${word.text}`,
        audioUrl: word.pronunciationAudioUrl,
        order: steps.length + 1,
      });

      const usageSentence = word.exampleSentences[index % Math.max(word.exampleSentences.length, 1)] || '';
      steps.push({
        stepId: `${word.wordId}:usage`,
        type: 'USE_IN_SENTENCE',
        wordId: word.wordId,
        prompt: usageSentence || `Use ${word.text} in context`,
        order: steps.length + 1,
      });
    });

    return steps;
  }

  private async ensureWordAudio(wordId: string, language: string, word: string): Promise<string> {
    const cached = await this.pronunciationService.getCachedAudio(wordId, language);
    if (cached) {
      return cached.audioUrl;
    }

    try {
      const generatedAudioDataUri = await this.elevenLabsClient.generateSpeech(word);
      const uploadedAudio = await this.cloudinaryService.uploadAudioDataUri(
        generatedAudioDataUri,
        'coach-plingo/pronunciation',
      );

      const saved = await this.pronunciationService.cacheAudio({
        wordId,
        language,
        audioUrl: uploadedAudio.secureUrl,
      });

      return saved.audioUrl;
    } catch (error) {
      this.logger.warn(`Audio generation unavailable for word ${wordId} (${language})`, error);
      return '';
    }
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private normalizeText(value: string): string {
    return value.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private computeTranscriptAccuracy(targetText: string, transcript: string): number {
    const normalizedTarget = this.normalizeText(targetText).replace(/[^a-z0-9\s]/gi, ' ');
    const normalizedTranscript = this.normalizeText(transcript).replace(/[^a-z0-9\s]/gi, ' ');

    if (!normalizedTarget || !normalizedTranscript) {
      return 0;
    }

    const distance = this.levenshtein(normalizedTarget, normalizedTranscript);
    const maxLen = Math.max(normalizedTarget.length, normalizedTranscript.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

    return Math.round(Math.max(0, Math.min(1, similarity)) * 10000) / 100;
  }

  private levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[a.length][b.length];
  }
}
