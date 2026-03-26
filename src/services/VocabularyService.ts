import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';

type DecimalLike = number | { toString(): string };

type DifficultyBand = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type WordStatus = 'ACTIVE' | 'LOCKED' | 'MASTERED';

interface GlobalVocabularySetRecord {
  id: string;
  language: string;
  profession: string;
  difficultyBand: DifficultyBand;
  wordCount: number;
  lastGeneratedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GlobalVocabularyWordRecord {
  id: string;
  setId: string;
  word: string;
  complexityLevel: DifficultyBand;
  examplePhrases?: unknown;
  exampleSentences?: unknown;
  tags?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface LearnerWordStateRecord {
  id: string;
  learningPathId: string;
  wordId: string;
  status: WordStatus;
  masteryScore: DecimalLike;
  pronunciationScore: DecimalLike;
  createdAt: Date;
  updatedAt: Date;
}

export interface WordData {
  word: string;
  complexityLevel: DifficultyBand;
  examplePhrases: string[];
  exampleSentences: string[];
  tags: string[];
}

export interface ActiveWindowWord {
  wordId: string;
  word: string;
  status: WordStatus;
  masteryScore: number;
  pronunciation_score: number;
  translation?: string;
}

export interface GlobalSetStats {
  totalWords: number;
  byComplexity: {
    BEGINNER: number;
    INTERMEDIATE: number;
    ADVANCED: number;
  };
}

export class VocabularyService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;

  // Active window size - configurable
  private readonly ACTIVE_WINDOW_SIZE = 20;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('VocabularyService');
  }

  /**
   * Get or create global vocabulary set for a language/profession combo
   * This is the shared pool that all learners draw from
   */
  async getOrCreateGlobalSet(
    language: string,
    profession: string,
    difficultyBand: DifficultyBand = 'BEGINNER',
  ): Promise<GlobalVocabularySetRecord> {
    let set = await this.prisma.globalVocabularySet.findUnique({
      where: {
        language_profession_difficultyBand: {
          language,
          profession,
          difficultyBand,
        },
      },
    });

    if (!set) {
      set = await this.prisma.globalVocabularySet.create({
        data: {
          language,
          profession,
          difficultyBand,
          wordCount: 0,
        },
      });

      this.logger.info(
        `Created new global vocabulary set: ${language} - ${profession} (${difficultyBand})`,
      );
    }

    return set;
  }

  /**
   * Add words to global vocabulary set
   * Called after AI generation - words are added globally once and reused forever
   */
  async addWordsToGlobalSet(setId: string, words: WordData[]): Promise<GlobalVocabularyWordRecord[]> {
    const createdWords: GlobalVocabularyWordRecord[] = [];

    for (const wordData of words) {
      // Check if word already exists in the set
      const existing = await this.prisma.globalVocabularyWord.findFirst({
        where: {
          setId,
          word: wordData.word,
        },
      });

      if (existing) {
        this.logger.debug(`Word already exists in set: ${wordData.word}`);
        createdWords.push(existing);
        continue;
      }

      const word = await this.prisma.globalVocabularyWord.create({
        data: {
          setId,
          word: wordData.word,
          complexityLevel: wordData.complexityLevel,
          examplePhrases: wordData.examplePhrases,
          exampleSentences: wordData.exampleSentences,
          tags: wordData.tags,
        },
      });

      createdWords.push(word);
    }

    // Update word count
    const wordCount = await this.prisma.globalVocabularyWord.count({
      where: { setId },
    });

    await this.prisma.globalVocabularySet.update({
      where: { id: setId },
      data: {
        wordCount,
        lastGeneratedAt: new Date(),
      },
    });

    this.logger.info(`Added ${createdWords.length} words to global set ${setId}`);

    return createdWords;
  }

  /**
   * Get unused words from global set for a learner
   * Reuse before generate: check if words are already available globally
   */
  async getUnusedWordsFromGlobalSet(
    setId: string,
    learningPathId: string,
    count: number,
    excludeWords: string[] = [],
  ): Promise<GlobalVocabularyWordRecord[]> {
    // Get words already assigned to this learner
    const assignedWordIds = await this.prisma.learnerWordState
      .findMany({
        where: { learningPathId },
        select: { wordId: true },
      })
      .then((states: Array<{ wordId: string }>) => states.map((s) => s.wordId));

    // Get unused words from global set
    const unused = await this.prisma.globalVocabularyWord.findMany({
      where: {
        setId,
        id: {
          notIn: assignedWordIds,
        },
        word: {
          notIn: excludeWords,
        },
      },
      take: count,
      orderBy: { createdAt: 'asc' },
    });

    this.logger.debug(
      `Found ${unused.length} unused words from global set for learner (requested: ${count})`,
    );

    return unused;
  }

  /**
   * Assign words to a learner's active window (status: LOCKED)
   * Called during lesson creation - words are locked initially, then promoted as active
   */
  async assignWordsToLearner(
    learningPathId: string,
    words: GlobalVocabularyWordRecord[],
  ): Promise<LearnerWordStateRecord[]> {
    const states: LearnerWordStateRecord[] = [];

    for (const word of words) {
      const state = await this.prisma.learnerWordState.create({
        data: {
          learningPathId,
          wordId: word.id,
          status: 'LOCKED',
          masteryScore: 0,
          pronunciationScore: 0,
        },
      });

      states.push(state);
    }

    this.logger.info(`Assigned ${states.length} words to learner path ${learningPathId}`);

    return states;
  }

  /**
   * Get active learning window for a learner
   * Returns currently active words (max ACTIVE_WINDOW_SIZE)
   */
  async getActiveWindow(
    learningPathId: string,
    baseLanguage: string,
  ): Promise<ActiveWindowWord[]> {
    const activeWords = await this.prisma.learnerWordState.findMany({
      where: {
        learningPathId,
        status: 'ACTIVE',
      },
      include: {
        word: {
          include: {
            translations: {
              where: { baseLanguage },
            },
          },
        },
      },
      orderBy: { masteryScore: 'asc' }, // Words needing more work first
      take: this.ACTIVE_WINDOW_SIZE,
    });

    return activeWords.map((state) => ({
      wordId: state.wordId,
      word: state.word.word,
      status: state.status,
      masteryScore: Number(state.masteryScore),
      pronunciation_score: Number(state.pronunciationScore),
      translation:
        state.word.translations.length > 0 ? state.word.translations[0].translation : undefined,
    }));
  }

  /**
   * Get total active window size for a learning path
   */
  async getActiveWindowSize(learningPathId: string): Promise<number> {
    return this.prisma.learnerWordState.count({
      where: {
        learningPathId,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Promote next locked word to active (when a word is mastered)
   * Returns the promoted word and the next locked word in queue
   */
  async promoteNextWord(
    learningPathId: string,
  ): Promise<{ promoted?: LearnerWordStateRecord; nextInQueue?: LearnerWordStateRecord }> {
    const activeCount = await this.getActiveWindowSize(learningPathId);

    // If window not full, promote a locked word
    if (activeCount < this.ACTIVE_WINDOW_SIZE) {
      const nextLocked = await this.prisma.learnerWordState.findFirst({
        where: {
          learningPathId,
          status: 'LOCKED',
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!nextLocked) {
        this.logger.info(`No more locked words to promote for path ${learningPathId}`);
        return {};
      }

      const promoted = await this.prisma.learnerWordState.update({
        where: { id: nextLocked.id },
        data: { status: 'ACTIVE' },
      });

      this.logger.info(`Promoted word to active: ${nextLocked.wordId}`);

      // Get next in queue
      const nextInQueue = await this.prisma.learnerWordState.findFirst({
        where: {
          learningPathId,
          status: 'LOCKED',
        },
        orderBy: { createdAt: 'asc' },
      });

      return { promoted, nextInQueue: nextInQueue || undefined };
    }

    return {};
  }

  /**
   * Get word stats for a learning path
   */
  async getWindowStats(learningPathId: string): Promise<{
    active: number;
    locked: number;
    mastered: number;
    totalMasteryScore: number;
  }> {
    const [active, locked, mastered, stats] = await Promise.all([
      this.prisma.learnerWordState.count({
        where: { learningPathId, status: 'ACTIVE' },
      }),
      this.prisma.learnerWordState.count({
        where: { learningPathId, status: 'LOCKED' },
      }),
      this.prisma.learnerWordState.count({
        where: { learningPathId, status: 'MASTERED' },
      }),
      this.prisma.learnerWordState.aggregate({
        where: { learningPathId },
        _avg: { masteryScore: true },
      }),
    ]);

    return {
      active,
      locked,
      mastered,
      totalMasteryScore: stats._avg.masteryScore ? Number(stats._avg.masteryScore) : 0,
    };
  }

  /**
   * Get global set statistics
   */
  async getGlobalSetStats(setId: string): Promise<GlobalSetStats> {
    const [total, byComplexity] = await Promise.all([
      this.prisma.globalVocabularyWord.count({ where: { setId } }),
      Promise.all([
        this.prisma.globalVocabularyWord.count({
          where: { setId, complexityLevel: 'BEGINNER' },
        }),
        this.prisma.globalVocabularyWord.count({
          where: { setId, complexityLevel: 'INTERMEDIATE' },
        }),
        this.prisma.globalVocabularyWord.count({
          where: { setId, complexityLevel: 'ADVANCED' },
        }),
      ]),
    ]);

    return {
      totalWords: total,
      byComplexity: {
        BEGINNER: byComplexity[0],
        INTERMEDIATE: byComplexity[1],
        ADVANCED: byComplexity[2],
      },
    };
  }

  /**
   * Add translation for a word
   */
  async addTranslation(wordId: string, baseLanguage: string, translation: string): Promise<void> {
    const existing = await this.prisma.wordTranslation.findUnique({
      where: {
        wordId_baseLanguage: {
          wordId,
          baseLanguage,
        },
      },
    });

    if (existing) {
      await this.prisma.wordTranslation.update({
        where: { id: existing.id },
        data: { translation },
      });
    } else {
      await this.prisma.wordTranslation.create({
        data: {
          wordId,
          baseLanguage,
          translation,
        },
      });
    }

    this.logger.debug(`Added translation for word ${wordId} in ${baseLanguage}`);
  }

  /**
   * Get word with translations
   */
  async getWord(wordId: string, baseLanguage?: string) {
    const word = await this.prisma.globalVocabularyWord.findUnique({
      where: { id: wordId },
      include: {
        translations: baseLanguage
          ? {
              where: { baseLanguage },
            }
          : true,
        audioCache: true,
      },
    });

    if (!word) {
      throw AppError.notFound('Word not found');
    }

    return word;
  }
}
