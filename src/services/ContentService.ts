import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';
import { ClaudeClient } from '../jobs/clients/ClaudeClient';
import { LessonGeneratorClient } from '../jobs/clients/LessonGeneratorClient';
import { ElevenLabsClient } from '../jobs/clients/ElevenLabsClient';
import { CloudinaryService } from './CloudinaryService';

const CONTENT_MODES = ['preseed', 'dynamic'] as const;
type ContentMode = (typeof CONTENT_MODES)[number];

type SessionWord = {
  id: string;
  word: string;
  ipa: string | null;
  complexityLevel: string;
  examplePhrases: Array<{ text: string; translation: string }>;
  fillGapSentences: Array<{ template: string; answer: string; templateTranslation?: string }>;
  tags: string[];
  translation: string | null;
  audioUrl: string | null;
  position: number;
};

type SessionQuestion = {
  questionId: string;
  questionText: string;
  questionTranslation?: string;
  options: string[] | null;
  optionsTranslation?: string[] | null;
  questionType: 'multiple_choice' | 'short_answer';
  position: number;
};

type SessionComprehension = {
  id: string;
  content: string;
  contentTranslation?: string;
  audioUrl?: string;
  tokenGlosses?: Array<{ token: string; start: number; end: number; lemma?: string; baseLanguageGloss: string; source: string }>;
  position: number;
  questions: SessionQuestion[];
};

export class ContentService {
  private readonly logger: SimpleLogger;
  private readonly generator: LessonGeneratorClient;
  private readonly ttsClient: ElevenLabsClient;
  private readonly cloudinaryService: CloudinaryService;

  constructor(private readonly prisma: PrismaClient) {
    this.logger = new SimpleLogger('ContentService');
    this.generator = new LessonGeneratorClient(new ClaudeClient());
    this.ttsClient = new ElevenLabsClient();
    this.cloudinaryService = new CloudinaryService();
  }

  getContentMode(): ContentMode {
    const raw = (process.env.CONTENT_MODE || 'dynamic').toLowerCase();
    if (CONTENT_MODES.includes(raw as ContentMode)) {
      return raw as ContentMode;
    }

    throw AppError.internal(
      `Invalid CONTENT_MODE value: ${raw}. Expected one of: ${CONTENT_MODES.join(', ')}`,
    );
  }

  async getOrGenerateLesson(params: {
    professionId: string;
    subcategoryId: string;
    scenarioId: string;
    language: string;
    baseLanguage: string;
  }): Promise<
    | { ready: true; lesson: NonNullable<Awaited<ReturnType<ContentService['findPublishedLesson']>>> }
    | { ready: false; status: 'PREPARING' }
  > {
    const existing = await this.findPublishedLesson(params.subcategoryId, params.scenarioId, params.language);
    if (existing) {
      return { ready: true, lesson: existing };
    }

    const mode = this.getContentMode();
    if (mode === 'preseed') {
      throw AppError.internal('LESSON_NOT_PUBLISHED');
    }

    try {
      await this.generateAndPublishLesson(params);
    } catch (error) {
      this.logger.warn('Lesson generation failed; returning PREPARING', {
        professionId: params.professionId,
        subcategoryId: params.subcategoryId,
        scenarioId: params.scenarioId,
        language: params.language,
        baseLanguage: params.baseLanguage,
        message: error instanceof Error ? error.message : String(error),
      });

      return { ready: false, status: 'PREPARING' };
    }

    const published = await this.findPublishedLesson(params.subcategoryId, params.scenarioId, params.language);
    if (!published) {
      return { ready: false, status: 'PREPARING' };
    }

    return { ready: true, lesson: published };
  }

  async buildSessionPayload(params: {
    pathId: string;
    lesson: NonNullable<Awaited<ReturnType<ContentService['findPublishedLesson']>>>;
    baseLanguage: string;
  }): Promise<{
    ready: true;
    lessonType: 'SCENARIO';
    lessonId: string;
    scenarioTitle: string;
    words: SessionWord[];
    comprehension: SessionComprehension[];
  }> {
    const words = params.lesson.words
      .sort((a, b) => a.position - b.position)
      .map<SessionWord>((word) => {
        const translation = word.translations.find((entry) => entry.baseLanguage === params.baseLanguage);
        const audio = word.audioCache.find((entry) => entry.language === params.lesson.language);

        return {
          id: word.id,
          word: word.word,
          ipa: word.ipa,
          complexityLevel: word.complexityLevel,
          examplePhrases: this.asPhraseArray(word.examplePhrases),
          fillGapSentences: this.asFillGapArray(word.exampleSentences, word.word),
          tags: this.asStringArray(word.tags),
          translation: translation?.translation ?? null,
          audioUrl: audio?.audioUrl ?? null,
          position: word.position,
        };
      });

    const comprehension = params.lesson.comprehensions
      .sort((a, b) => a.position - b.position)
      .map<SessionComprehension>((block) => ({
        id: block.id,
        content: block.content,
        contentTranslation: block.contentTranslation ?? undefined,
        audioUrl: block.audioUrl ?? undefined,
        tokenGlosses: block.tokenGlosses && Array.isArray(block.tokenGlosses) && block.tokenGlosses.length > 0 ? (block.tokenGlosses as Array<{ token: string; start: number; end: number; lemma?: string; baseLanguageGloss: string; source: string }>) : undefined,
        position: block.position,
        questions: block.questions
          .sort((a, b) => a.position - b.position)
          .map((question) => ({
            questionId: question.id,
            questionText: question.questionText,
            questionTranslation: question.questionTranslation ?? undefined,
            options: this.asStringArray(question.options),
            optionsTranslation: this.asStringArray(question.optionsTranslation),
            questionType: question.questionType === 'MULTIPLE_CHOICE' ? 'multiple_choice' : 'short_answer',
            position: question.position,
          })),
      }));

    return {
      ready: true,
      lessonType: 'SCENARIO',
      lessonId: params.lesson.id,
      scenarioTitle: params.lesson.scenario.displayName,
      words,
      comprehension,
    };
  }

  private async findPublishedLesson(
    subcategoryId: string,
    scenarioId: string,
    language: string,
  ): Promise<Prisma.ScenarioLessonGetPayload<{
    include: {
      words: {
        include: {
          translations: true;
          audioCache: true;
        };
      };
      comprehensions: {
        include: {
          questions: true;
        };
      };
      scenario: {
        select: {
          displayName: true;
        };
      };
    };
  }> | null> {
    return this.prisma.scenarioLesson.findUnique({
      where: {
        subcategoryId_scenarioId_language: {
          subcategoryId,
          scenarioId,
          language,
        },
      },
      include: {
        words: {
          include: {
            translations: true,
            audioCache: true,
          },
        },
        comprehensions: {
          include: {
            questions: true,
          },
        },
        scenario: {
          select: {
            displayName: true,
          },
        },
      },
    }).then((lesson) => {
      if (!lesson || lesson.status !== 'PUBLISHED') {
        return null;
      }
      return lesson;
    });
  }

  private async generateAndPublishLesson(params: {
    professionId: string;
    subcategoryId: string;
    scenarioId: string;
    language: string;
    baseLanguage: string;
  }): Promise<void> {
    const [profession, subcategory, scenario] = await Promise.all([
      this.prisma.professionOption.findUnique({ where: { id: params.professionId } }),
      this.prisma.professionSubcategory.findUnique({ where: { id: params.subcategoryId } }),
      this.prisma.professionScenario.findUnique({ where: { id: params.scenarioId } }),
    ]);

    if (!profession || !subcategory || !scenario) {
      throw AppError.notFound('Unable to generate lesson: profession, subcategory, or scenario not found');
    }

    const generated = await this.generator.generateLesson({
      profession: profession.name,
      professionDescription: profession.description || undefined,
      subcategoryName: subcategory.name,
      subcategoryDescription: subcategory.description || undefined,
      scenarioName: scenario.displayName,
      scenarioDescription: scenario.description || undefined,
      targetLanguage: params.language,
      baseLanguages: [params.baseLanguage],
      passageCount: 1,
      count: 10,
      excludeWords: [],
    });

    const audioQueue: Array<{ wordId: string; word: string; ipa?: string; previousText?: string; nextText?: string }> = [];
    const comprehensionAudioQueue: Array<{ comprehensionId: string; content: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      const lesson = await tx.scenarioLesson.upsert({
        where: {
          subcategoryId_scenarioId_language: {
            subcategoryId: params.subcategoryId,
            scenarioId: params.scenarioId,
            language: params.language,
          },
        },
        update: {
          scenarioPosition: scenario.position,
          status: 'DRAFT',
          generatedAt: new Date(),
        },
        create: {
          subcategoryId: params.subcategoryId,
          scenarioId: params.scenarioId,
          language: params.language,
          scenarioPosition: scenario.position,
          status: 'DRAFT',
          generatedAt: new Date(),
        },
      });

      await tx.scenarioWord.deleteMany({ where: { lessonId: lesson.id } });
      await tx.scenarioComprehension.deleteMany({ where: { lessonId: lesson.id } });

      for (let index = 0; index < generated.words.length; index += 1) {
        const item = generated.words[index];
        const createdWord = await tx.scenarioWord.create({
          data: {
            lessonId: lesson.id,
            word: item.word,
            ipa: item.ipa,
            complexityLevel: this.mapComplexity(item.complexityLevel),
            examplePhrases: item.examplePhrases,
            exampleSentences: item.fillGapSentences,
            tags: item.tags,
            position: index + 1,
          },
        });

        const translation = item.translations[params.baseLanguage];
        if (translation) {
          await tx.wordTranslation.upsert({
            where: {
              scenarioWordId_baseLanguage: {
                scenarioWordId: createdWord.id,
                baseLanguage: params.baseLanguage,
              },
            },
            update: {
              translation,
              wordId: null,
            },
            create: {
              wordId: null,
              scenarioWordId: createdWord.id,
              baseLanguage: params.baseLanguage,
              translation,
            },
          });
        }

        const contextHints = this.buildWordSpeechContext(item.word, item.examplePhrases, item.fillGapSentences);
        audioQueue.push({
          wordId: createdWord.id,
          word: item.word,
          ipa: item.ipa ?? undefined,
          previousText: contextHints.previousText,
          nextText: contextHints.nextText,
        });
      }

      for (const passage of generated.passages) {
        const createdComprehension = await tx.scenarioComprehension.create({
          data: {
            lessonId: lesson.id,
            content: passage.content,
            contentTranslation: passage.contentTranslation ?? null,
            position: passage.position,
            ...(passage.tokenGlosses && passage.tokenGlosses.length > 0 ? { tokenGlosses: passage.tokenGlosses } : {}),
          },
        });
        comprehensionAudioQueue.push({ comprehensionId: createdComprehension.id, content: passage.content });

        if (passage.questions.length > 0) {
          await tx.comprehensionQuestion.createMany({
            data: passage.questions.map((question) => ({
              storyId: null as null,
              comprehensionId: createdComprehension.id,
              questionText: question.questionText,
              questionTranslation: question.questionTranslation ?? null,
              options: question.options ?? [],
              correctAnswer: question.correctAnswer,
              questionType: question.questionType === 'multiple_choice' ? 'MULTIPLE_CHOICE' : ('SHORT_ANSWER' as const),
              position: question.position,
              ...(question.optionsTranslation && question.optionsTranslation.length > 0
                ? { optionsTranslation: question.optionsTranslation }
                : {}),
            })),
          });
        }
      }

      await tx.scenarioLesson.update({
        where: { id: lesson.id },
        data: {
          status: 'PUBLISHED',
          reviewedAt: new Date(),
          publishedAt: new Date(),
        },
      });
    }, { timeout: 60_000 });

    const ttsVoiceId = await ElevenLabsClient.resolveVoiceId(this.prisma, params.language);

    for (const item of audioQueue) {
      const audioData = await this.ttsClient.generateSpeech(item.word, params.language, {
        singleWordMode: true,
        voiceId: ttsVoiceId,
        ipa: item.ipa,
      });
      if (!audioData) {
        continue;
      }

      let uploadedAudioUrl: string | null = null;
      try {
        const uploadedAudio = await this.cloudinaryService.uploadAudioDataUri(
          audioData,
          `coachplingo/lesson-audio/${params.language}`,
        );
        uploadedAudioUrl = uploadedAudio.secureUrl;
      } catch (error) {
        this.logger.warn(
          `Audio upload failed for wordId=${item.wordId} language=${params.language}; skipping cache update. reason=${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      await this.prisma.wordAudioCache.upsert({
        where: {
          wordId_language: {
            wordId: item.wordId,
            language: params.language,
          },
        },
        update: {
          audioUrl: uploadedAudioUrl,
        },
        create: {
          wordId: item.wordId,
          language: params.language,
          audioUrl: uploadedAudioUrl,
        },
      });
    }

    for (const item of comprehensionAudioQueue) {
      const audioData = await this.ttsClient.generateSpeech(item.content, params.language, {
        voiceId: ttsVoiceId,
      });
      if (!audioData) {
        continue;
      }

      let uploadedAudioUrl: string | null = null;
      try {
        const uploadedAudio = await this.cloudinaryService.uploadAudioDataUri(
          audioData,
          `coachplingo/comprehension-audio/${params.language}`,
        );
        uploadedAudioUrl = uploadedAudio.secureUrl;
      } catch (error) {
        this.logger.warn(
          `Comprehension audio upload failed for comprehensionId=${item.comprehensionId} language=${params.language}; skipping. reason=${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      await this.prisma.scenarioComprehension.update({
        where: { id: item.comprehensionId },
        data: { audioUrl: uploadedAudioUrl },
      });
    }

    this.logger.info(
      `Generated scenario lesson for profession=${profession.slug}, subcategory=${subcategory.id}, scenario=${scenario.id}, language=${params.language}`,
    );
  }

  private mapComplexity(level: string): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' {
    const normalized = level.toLowerCase();
    if (normalized === 'beginner') return 'BEGINNER';
    if (normalized === 'advanced') return 'ADVANCED';
    return 'INTERMEDIATE';
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private asPhraseArray(value: unknown): Array<{ text: string; translation: string }> {
    if (!Array.isArray(value)) return [];

    return value
      .filter((entry): entry is { text?: unknown; translation?: unknown } => {
        return typeof entry === 'object' && entry !== null;
      })
      .map((entry) => ({
        text: typeof entry.text === 'string' ? entry.text : '',
        translation: typeof entry.translation === 'string' ? entry.translation : '',
      }))
      .filter((entry) => entry.text.length > 0 && entry.translation.length > 0);
  }

  private asFillGapArray(value: unknown, fallbackAnswer: string): Array<{ template: string; answer: string; templateTranslation?: string }> {
    if (!Array.isArray(value)) return [];

    return value
      .filter((entry): entry is { template?: unknown; answer?: unknown; templateTranslation?: unknown } => {
        return typeof entry === 'object' && entry !== null;
      })
      .map((entry) => ({
        template: typeof entry.template === 'string' ? entry.template : '',
        answer: typeof entry.answer === 'string' ? entry.answer : fallbackAnswer,
        templateTranslation: typeof entry.templateTranslation === 'string' ? entry.templateTranslation : undefined,
      }))
      .filter((entry) => entry.template.length > 0);
  }

  private buildWordSpeechContext(
    word: string,
    examplePhrases: Array<{ text: string; translation: string }>,
    fillGapSentences: Array<{ template: string; answer: string; templateTranslation?: string }>,
  ): { previousText?: string; nextText?: string } {
    const candidates = [
      ...examplePhrases.map((phrase) => phrase.text),
      ...fillGapSentences.map((sentence) =>
        sentence.template.includes('___')
          ? sentence.template.replace('___', sentence.answer || word)
          : sentence.template,
      ),
    ];

    for (const candidate of candidates) {
      const context = this.extractContextAroundWord(candidate, word);
      if (context) {
        return context;
      }
    }

    return {};
  }

  private extractContextAroundWord(
    sentence: string,
    targetWord: string,
  ): { previousText?: string; nextText?: string } | null {
    const normalizedSentence = String(sentence || '').replace(/\s+/g, ' ').trim();
    const normalizedTarget = String(targetWord || '').trim();
    if (!normalizedSentence || !normalizedTarget) {
      return null;
    }

    const target = normalizedTarget.toLocaleLowerCase();
    const tokenRegex = /[\p{L}\p{N}'’-]+/gu;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(normalizedSentence)) !== null) {
      const token = match[0];
      if (token.toLocaleLowerCase() !== target) {
        continue;
      }

      const start = match.index;
      const end = start + token.length;
      const previousText = normalizedSentence.slice(0, start).trim();
      const nextText = normalizedSentence.slice(end).trim();

      if (!previousText && !nextText) {
        return null;
      }

      return {
        ...(previousText ? { previousText } : {}),
        ...(nextText ? { nextText } : {}),
      };
    }

    return null;
  }
}
