import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { StreakService } from './StreakService';
import { ContentService } from './ContentService';
import { BadgeService } from './BadgeService';

export const completeScenarioSessionSchema = z.object({
  lessonType: z.literal('SCENARIO'),
  lessonId: z.string().min(1).optional(),
  wordResults: z.array(
    z.object({
      wordId: z.string().min(1),
      pronunciationAttemptId: z.string().min(1).optional(),
      pronunciationScore: z.number().min(0).max(100).optional(),
      fillGapCorrect: z.boolean(),
      attemptCount: z.number().int().min(1),
    }).refine(
      (value) => value.pronunciationAttemptId || value.pronunciationScore !== undefined,
      {
        message: 'pronunciationAttemptId or pronunciationScore is required',
        path: ['pronunciationAttemptId'],
      },
    ),
  ),
  comprehensionResponses: z.array(
    z.object({
      questionId: z.string().min(1),
      response: z.string().min(1),
    }),
  ),
});

export type CompleteScenarioSessionInput = z.infer<typeof completeScenarioSessionSchema>;

export class LessonSessionService {
  private readonly prisma: PrismaClient;
  private readonly streakService: StreakService;
  private readonly badgeService: BadgeService;
  // Scoring thresholds
  private static readonly PRONUNCIATION_PASS_THRESHOLD = 70;
  private static readonly UNLOCK_THRESHOLD = 70; // passRate % required to unlock next lesson
  private static readonly WORD_MASTERY_THRESHOLD = 70; // % of lesson words mastered to set lessonMastered = true

  private readonly contentService: ContentService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.streakService = new StreakService(prisma);
    this.badgeService = new BadgeService(prisma);
    this.contentService = new ContentService(prisma);
  }

  private async getPublishedLessonById(lessonId: string) {
    const lesson = await this.prisma.scenarioLesson.findUnique({
      where: { id: lessonId },
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
    });

    if (!lesson || lesson.status !== 'PUBLISHED') {
      throw AppError.notFound('Published lesson not found');
    }

    return lesson;
  }

  private rotateSubcategoryOrder<T extends { subcategoryId: string; subcategoryPosition: number }>(
    items: T[],
    currentSubcategoryId: string | null | undefined,
  ): T[] {
    const ordered = [...items].sort((a, b) => a.subcategoryPosition - b.subcategoryPosition);
    if (!currentSubcategoryId) {
      return ordered;
    }

    const startIndex = ordered.findIndex((item) => item.subcategoryId === currentSubcategoryId);
    if (startIndex <= 0) {
      return ordered;
    }

    return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
  }

  async getCurrentScenarioSession(pathId: string, learnerId: string): Promise<Record<string, unknown>> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      include: {
        learner: true,
      },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.learnerId !== learnerId) {
      throw AppError.forbidden('Not authorized');
    }

    if (!path.professionId) {
      throw AppError.badRequest('Learning path is missing profession reference');
    }

    const activeRows = await this.prisma.learnerScenarioProgress.findMany({
      where: {
        learningPathId: pathId,
        status: 'ACTIVE',
      },
      include: {
        lesson: {
          include: {
            scenario: {
              select: {
                displayName: true,
              },
            },
            subcategory: {
              select: {
                name: true,
                position: true,
              },
            },
          },
        },
      },
      orderBy: [
        { lesson: { subcategory: { position: 'asc' } } },
        { lesson: { scenarioPosition: 'asc' } },
        { createdAt: 'asc' },
      ],
    });

    if (activeRows.length === 0) {
      return {
        ready: false,
        status: 'PREPARING' as const,
      };
    }

    const active = activeRows.find((row) => row.lesson.scenarioId === path.currentScenarioId) ?? activeRows[0];

    if (activeRows.length > 1) {
      const duplicateIds = activeRows
        .filter((row) => row.id !== active.id)
        .map((row) => row.id);

      await this.prisma.$transaction(async (tx) => {
        await tx.learnerScenarioProgress.updateMany({
          where: {
            learningPathId: pathId,
            status: 'ACTIVE',
            id: { in: duplicateIds },
          },
          data: {
            status: 'LOCKED',
          },
        });

        await tx.learningPath.update({
          where: { id: pathId },
          data: {
            currentScenarioId: active.lesson.scenarioId,
            currentSubcategoryId: active.lesson.subcategoryId,
          },
        });
      });
    }

    const content = await this.contentService.getOrGenerateLesson({
      professionId: path.professionId,
      subcategoryId: active.lesson.subcategoryId,
      scenarioId: active.lesson.scenarioId,
      language: path.language,
      baseLanguage: path.learner.baseLanguage,
    });

    if (!content.ready) {
      return {
        ...content,
        lessonType: 'SCENARIO' as const,
        lessonId: active.lessonId,
        scenarioId: active.lesson.scenarioId,
        scenarioTitle: active.lesson.scenario.displayName,
        subcategoryId: active.lesson.subcategoryId,
        subcategoryName: active.lesson.subcategory.name,
      };
    }

    return this.contentService.buildSessionPayload({
      pathId,
      lesson: content.lesson,
      baseLanguage: path.learner.baseLanguage,
    });
  }

  async completeScenarioSession(
    pathId: string,
    learnerId: string,
    input: CompleteScenarioSessionInput,
  ): Promise<Record<string, unknown>> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
      select: {
        id: true,
        learnerId: true,
        currentSubcategoryId: true,
      },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.learnerId !== learnerId) {
      throw AppError.forbidden('Not authorized');
    }

    const targetProgress = await this.prisma.learnerScenarioProgress.findFirst({
      where: input.lessonId
        ? {
          learningPathId: pathId,
          lessonId: input.lessonId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
        }
        : {
          learningPathId: pathId,
          status: 'ACTIVE',
        },
      include: {
        lesson: {
          include: {
            words: true,
            comprehensions: {
              include: {
                questions: true,
              },
            },
          },
        },
      },
    });

    if (!targetProgress) {
      throw AppError.badRequest('No matching scenario lesson found');
    }

    const isRetake = targetProgress.status === 'COMPLETED';

    const validWordIds = new Set(targetProgress.lesson.words.map((word) => word.id));
    const wordCount = validWordIds.size;

    if (input.wordResults.length !== wordCount) {
      throw AppError.badRequest('wordResults must include exactly all lesson words');
    }

    const submittedWordIds = new Set(input.wordResults.map((result) => result.wordId));
    if (submittedWordIds.size !== wordCount) {
      throw AppError.badRequest('wordResults contains duplicate or missing word ids');
    }

    for (const wordResult of input.wordResults) {
      if (!validWordIds.has(wordResult.wordId)) {
        throw AppError.badRequest(`Invalid word id for current lesson: ${wordResult.wordId}`);
      }
    }

    const questions = targetProgress.lesson.comprehensions.flatMap((comprehension) => comprehension.questions);
    const questionsById = new Map(questions.map((question) => [question.id, question]));

    if (questionsById.size > 0) {
      if (input.comprehensionResponses.length !== questionsById.size) {
        throw AppError.badRequest('comprehensionResponses must include exactly all lesson questions');
      }

      const submittedQuestionIds = new Set(input.comprehensionResponses.map((response) => response.questionId));
      if (submittedQuestionIds.size !== questionsById.size) {
        throw AppError.badRequest('comprehensionResponses contains duplicate or missing question ids');
      }
    }

    let correctAnswers = 0;
    let fillGapPassedCount = 0;
    let pronunciationPassedCount = 0;
    let lessonPassed = false;
    let unlockedNextLesson = false;
    let pathCompleted = false;
    let wordMasteryLevel = 0;
    let lessonMastered = false;
    let xpEarned = 0;

    const pronunciationAttemptIds = input.wordResults
      .map((result) => result.pronunciationAttemptId)
      .filter((attemptId): attemptId is string => Boolean(attemptId));

    const uniqueAttemptIds = [...new Set(pronunciationAttemptIds)];
    const attemptsById = new Map<string, { id: string; wordId: string | null; accuracyScore: Prisma.Decimal }>();

    if (uniqueAttemptIds.length > 0) {
      const attempts = await this.prisma.pronunciationAttempt.findMany({
        where: {
          id: { in: uniqueAttemptIds },
          learnerId,
        },
        select: {
          id: true,
          wordId: true,
          accuracyScore: true,
        },
      });

      if (attempts.length !== uniqueAttemptIds.length) {
        throw AppError.badRequest('One or more pronunciation attempts are invalid for this learner');
      }

      for (const attempt of attempts) {
        attemptsById.set(attempt.id, attempt);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const wordResult of input.wordResults) {
        const attempt = wordResult.pronunciationAttemptId
          ? attemptsById.get(wordResult.pronunciationAttemptId)
          : null;

        if (wordResult.pronunciationAttemptId && !attempt) {
          throw AppError.badRequest(`Pronunciation attempt not found: ${wordResult.pronunciationAttemptId}`);
        }

        if (attempt && attempt.wordId !== wordResult.wordId) {
          throw AppError.badRequest(
            `Pronunciation attempt ${attempt.id} does not belong to word ${wordResult.wordId}`,
          );
        }

        const rawPronunciationScore = attempt
          ? Number(attempt.accuracyScore)
          : wordResult.pronunciationScore;

        if (rawPronunciationScore === undefined) {
          throw AppError.badRequest(
            `Pronunciation score is missing for word ${wordResult.wordId}`,
          );
        }

        const normalizedPronunciationScore = Math.max(0, Math.min(100, rawPronunciationScore));
        const pronunciationPassed = normalizedPronunciationScore >= LessonSessionService.PRONUNCIATION_PASS_THRESHOLD;
        if (wordResult.fillGapCorrect) fillGapPassedCount += 1;
        if (pronunciationPassed) pronunciationPassedCount += 1;

        await tx.learnerWordState.upsert({
          where: {
            learningPathId_scenarioWordId: {
              learningPathId: pathId,
              scenarioWordId: wordResult.wordId,
            },
          },
          update: {
            pronunciationScore: normalizedPronunciationScore / 10,
            attemptCount: {
              increment: wordResult.attemptCount,
            },
            // Sticky booleans — only upgrade, never revert
            ...(wordResult.fillGapCorrect && { fillGapCompleted: true, usageCompleted: true }),
            ...(pronunciationPassed && { pronunciationPassed: true }),
            lastAttemptedAt: new Date(),
          },
          create: {
            learningPathId: pathId,
            scenarioWordId: wordResult.wordId,
            status: 'ACTIVE',
            meaningSeen: true,
            usageCompleted: wordResult.fillGapCorrect,
            fillGapCompleted: wordResult.fillGapCorrect,
            pronunciationPassed,
            pronunciationScore: normalizedPronunciationScore / 10,
            attemptCount: wordResult.attemptCount,
            lastAttemptedAt: new Date(),
          },
        });
      }

      // After all word upserts, recompute mastered flag for each word based on sticky state
      // then update lessonMastered count. We do this in two passes to handle the sticky logic.
      const lessonWordIds = input.wordResults.map((r) => r.wordId);
      const wordStates = await tx.learnerWordState.findMany({
        where: {
          learningPathId: pathId,
          scenarioWordId: { in: lessonWordIds },
        },
        select: { id: true, fillGapCompleted: true, pronunciationPassed: true, mastered: true },
      });

      let masteredCount = 0;
      for (const ws of wordStates) {
        const nowMastered = ws.fillGapCompleted && ws.pronunciationPassed;
        if (nowMastered !== ws.mastered) {
          await tx.learnerWordState.update({
            where: { id: ws.id },
            data: { mastered: nowMastered, status: nowMastered ? 'MASTERED' : 'ACTIVE' },
          });
        }
        if (nowMastered) masteredCount += 1;
      }

      wordMasteryLevel = wordCount > 0 ? Math.round((masteredCount / wordCount) * 10000) / 100 : 0;
      lessonMastered = wordMasteryLevel >= LessonSessionService.WORD_MASTERY_THRESHOLD;

      for (const response of input.comprehensionResponses) {
        const question = questionsById.get(response.questionId);
        if (!question) {
          throw AppError.badRequest(`Invalid question id for current lesson: ${response.questionId}`);
        }

        const expected = question.correctAnswer.trim().toLowerCase();
        const actual = response.response.trim().toLowerCase();
        const isCorrect = expected === actual;
        if (isCorrect) {
          correctAnswers += 1;
        }

        await tx.comprehensionResponse.create({
          data: {
            learnerId,
            questionId: question.id,
            response: response.response,
            isCorrect,
          },
        });
      }

      const totalQuestions = Math.max(questions.length, 1);
      const comprehensionScore = Math.round((correctAnswers / totalQuestions) * 10000) / 100;
      const comprehensionPassedCount = correctAnswers;
      const comprehensionPassed = comprehensionScore >= LessonSessionService.UNLOCK_THRESHOLD;

      const totalExercises = wordCount * 2 + questions.length;
      const passedExercises = fillGapPassedCount + pronunciationPassedCount + comprehensionPassedCount;
      const passRate = totalExercises > 0 ? Math.round((passedExercises / totalExercises) * 10000) / 100 : 0;
      lessonPassed = passRate >= LessonSessionService.UNLOCK_THRESHOLD;

      const now = new Date();
      const existingCompletedAt = targetProgress.completedAt;
      const bestScore = targetProgress.bestCompScore
        ? Number(targetProgress.bestCompScore)
        : null;

      const progressUpdate: Prisma.LearnerScenarioProgressUpdateInput = {
        wordsCompleted: input.wordResults.length,
        comprehensionPassed,
        comprehensionScore,
        wordMasteryLevel,
        lessonMastered,
        startedAt: targetProgress.startedAt ?? now,
      };

      if (isRetake) {
        // Retakes always record the attempt; mastery fields already updated above
        progressUpdate.timesCompleted = { increment: 1 };
        progressUpdate.bestCompScore =
          bestScore === null || comprehensionScore > bestScore ? comprehensionScore : bestScore;
        progressUpdate.lastCompletedAt = now;
      } else if (lessonPassed) {
        progressUpdate.status = 'COMPLETED';
        progressUpdate.timesCompleted = {
          increment: 1,
        };
        progressUpdate.bestCompScore =
          bestScore === null || comprehensionScore > bestScore ? comprehensionScore : bestScore;
        progressUpdate.completedAt = existingCompletedAt ?? now;
        progressUpdate.lastCompletedAt = now;

        // XP is awarded once per lesson on first successful completion.
        xpEarned = Math.round(passRate);
        await tx.learningPath.update({
          where: { id: pathId },
          data: {
            pathXp: {
              increment: xpEarned,
            },
          },
        });
      } else {
        progressUpdate.status = 'ACTIVE';
      }

      await tx.learnerScenarioProgress.update({
        where: { id: targetProgress.id },
        data: progressUpdate,
      });

      await tx.learnerScenarioProgress.updateMany({
        where: {
          learningPathId: pathId,
          status: 'ACTIVE',
          id: { not: targetProgress.id },
        },
        data: {
          status: 'LOCKED',
        },
      });

      // Retakes never unlock further lessons or complete the path
      if (isRetake || !lessonPassed) {
        return;
      }

      const currentSubcategoryId = targetProgress.lesson.subcategoryId;

      let nextLesson = await tx.learnerScenarioProgress.findFirst({
        where: {
          learningPathId: pathId,
          status: 'LOCKED',
          lesson: {
            subcategoryId: currentSubcategoryId,
          },
        },
        include: {
          lesson: {
            include: {
              subcategory: true,
              words: true,
            },
          },
        },
        orderBy: [
          { lesson: { scenarioPosition: 'asc' } },
          { createdAt: 'asc' },
        ],
      });

      let nextSubcategoryId = currentSubcategoryId;

      // When current subcategory is exhausted, move to the next subcategory in rotated order.
      if (!nextLesson) {
        const remainingInCurrent = await tx.learnerScenarioProgress.count({
          where: {
            learningPathId: pathId,
            lesson: {
              subcategoryId: currentSubcategoryId,
            },
            status: { not: 'COMPLETED' },
          },
        });

        if (remainingInCurrent === 0) {
          await tx.subcategoryProgress.update({
            where: {
              learningPathId_subcategoryId: {
                learningPathId: pathId,
                subcategoryId: currentSubcategoryId,
              },
            },
            data: {
              status: 'COMPLETED',
              completedAt: now,
            },
          });
        }

        const subcategoryRows = await tx.subcategoryProgress.findMany({
          where: { learningPathId: pathId },
          include: {
            subcategory: {
              select: {
                position: true,
              },
            },
          },
        });

        const rotated = this.rotateSubcategoryOrder(
          subcategoryRows.map((row) => ({
            subcategoryId: row.subcategoryId,
            subcategoryPosition: row.subcategory.position,
          })),
          currentSubcategoryId,
        );

        for (const candidate of rotated) {
          if (candidate.subcategoryId === currentSubcategoryId) {
            continue;
          }

          const candidateLesson = await tx.learnerScenarioProgress.findFirst({
            where: {
              learningPathId: pathId,
              status: 'LOCKED',
              lesson: {
                subcategoryId: candidate.subcategoryId,
              },
            },
            include: {
              lesson: {
                include: {
                  subcategory: true,
                  words: true,
                },
              },
            },
            orderBy: [
              { lesson: { scenarioPosition: 'asc' } },
              { createdAt: 'asc' },
            ],
          });

          if (candidateLesson) {
            nextLesson = candidateLesson;
            nextSubcategoryId = candidate.subcategoryId;
            break;
          }
        }
      }

      if (nextLesson) {
        unlockedNextLesson = true;
        await tx.learnerScenarioProgress.update({
          where: { id: nextLesson.id },
          data: {
            status: 'ACTIVE',
            unlockedAt: now,
          },
        });

        for (const word of nextLesson.lesson.words) {
          await tx.learnerWordState.upsert({
            where: {
              learningPathId_scenarioWordId: {
                learningPathId: pathId,
                scenarioWordId: word.id,
              },
            },
            update: {
              status: 'ACTIVE',
            },
            create: {
              learningPathId: pathId,
              scenarioWordId: word.id,
              status: 'ACTIVE',
            },
          });
        }

        nextSubcategoryId = nextLesson.lesson.subcategoryId;

        await tx.learningPath.update({
          where: { id: pathId },
          data: {
            currentScenarioId: nextLesson.lesson.scenarioId,
            currentSubcategoryId: nextSubcategoryId,
          },
        });

        if (currentSubcategoryId !== nextSubcategoryId) {
          await tx.subcategoryProgress.update({
            where: {
              learningPathId_subcategoryId: {
                learningPathId: pathId,
                subcategoryId: nextSubcategoryId,
              },
            },
            data: {
              status: 'ACTIVE',
              unlockedAt: now,
              completedAt: null,
            },
          });
        }
      } else {
        pathCompleted = true;
        await tx.subcategoryProgress.update({
          where: {
            learningPathId_subcategoryId: {
              learningPathId: pathId,
              subcategoryId: targetProgress.lesson.subcategoryId,
            },
          },
          data: {
            status: 'COMPLETED',
            completedAt: now,
          },
        });
        await tx.learningPath.update({
          where: { id: pathId },
          data: {
            status: 'COMPLETED',
            completedAt: now,
          },
        });
      }
    });

    await this.streakService.updateStreak(learnerId, new Date());

    // Badge checks for lesson completion and XP (fire-and-forget)
    if (lessonPassed && !isRetake) {
      this.checkLessonBadges(learnerId, pathId, xpEarned).catch(() => undefined);
    }

    const totalExercisesReturn = wordCount * 2 + questions.length;
    const passRateExact = totalExercisesReturn > 0
      ? Math.round(((fillGapPassedCount + pronunciationPassedCount + correctAnswers) / totalExercisesReturn) * 10000) / 100
      : 0;

    return {
      success: true,
      lessonId: targetProgress.lessonId,
      retake: isRetake,
      lessonPassed,
      unlockedNextLesson,
      pathCompleted,
      wordMasteryLevel,
      lessonMastered,
      xpEarned,
      performance: {
        totalExercises: totalExercisesReturn,
        passedExercises: fillGapPassedCount + pronunciationPassedCount + correctAnswers,
        passRate: passRateExact,
        passRateExact,
        passRateRounded: Math.round(passRateExact),
        breakdown: {
          fillGapPassedCount,
          pronunciationPassedCount,
          comprehensionPassedCount: correctAnswers,
        },
        thresholds: {
          pronunciationPassThreshold: LessonSessionService.PRONUNCIATION_PASS_THRESHOLD,
          unlockThreshold: LessonSessionService.UNLOCK_THRESHOLD,
          wordMasteryThreshold: LessonSessionService.WORD_MASTERY_THRESHOLD,
        },
      },
    };
  }

  async getScenarioLessonMap(pathId: string, learnerId: string): Promise<Record<string, unknown>> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
    });

    if (!path) {
      throw AppError.notFound('Learning path not found');
    }

    if (path.learnerId !== learnerId) {
      throw AppError.forbidden('Not authorized');
    }

    const progressRows = await this.prisma.learnerScenarioProgress.findMany({
      where: { learningPathId: pathId },
      include: {
        lesson: {
          include: {
            scenario: true,
            subcategory: true,
          },
        },
      },
      orderBy: [
        { lesson: { subcategory: { position: 'asc' } } },
        { lesson: { scenarioPosition: 'asc' } },
      ],
    });

    const grouped = new Map<string, {
      subcategoryId: string;
      subcategoryName: string;
      subcategoryPosition: number;
      lessons: Array<Record<string, unknown>>;
    }>();

    for (const row of progressRows) {
      const key = row.lesson.subcategoryId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          subcategoryId: row.lesson.subcategoryId,
          subcategoryName: row.lesson.subcategory.name,
          subcategoryPosition: row.lesson.subcategory.position,
          lessons: [],
        });
      }

      grouped.get(key)!.lessons.push({
        lessonId: row.lessonId,
        scenarioId: row.lesson.scenarioId,
        scenarioName: row.lesson.scenario.displayName,
        scenarioPosition: row.lesson.scenarioPosition,
        status: row.status,
        timesCompleted: row.timesCompleted,
        bestComprehensionScore: row.bestCompScore ? Number(row.bestCompScore) : null,
        wordMasteryLevel: Number(row.wordMasteryLevel),
        lessonMastered: row.lessonMastered,
        lastCompletedAt: row.lastCompletedAt,
        unlockedAt: row.unlockedAt,
      });
    }

    const effectiveCurrentSubcategoryId =
      progressRows.find((row) => row.status === 'ACTIVE')?.lesson.subcategoryId ||
      path.currentSubcategoryId;

    const subcategories = this.rotateSubcategoryOrder(
      Array.from(grouped.values()),
      effectiveCurrentSubcategoryId,
    );

    const totalLessons = progressRows.length;
    const completedLessons = progressRows.filter((row) => row.status === 'COMPLETED').length;
    const activeLessons = progressRows.filter((row) => row.status === 'ACTIVE').length;
    const lockedLessons = progressRows.filter((row) => row.status === 'LOCKED').length;
    const masteredLessons = progressRows.filter((row) => row.lessonMastered).length;

    return {
      pathId,
      summary: {
        totalLessons,
        completedLessons,
        masteredLessons,
        activeLessons,
        lockedLessons,
      },
      subcategories,
    };
  }

  async startScenarioRetake(
    pathId: string,
    learnerId: string,
    lessonId: string,
  ): Promise<Record<string, unknown>> {
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

    if (!path.professionId) {
      throw AppError.badRequest('Learning path is missing profession reference');
    }

    const lessonProgress = await this.prisma.learnerScenarioProgress.findUnique({
      where: {
        learningPathId_lessonId: {
          learningPathId: pathId,
          lessonId,
        },
      },
      include: {
        lesson: {
          include: {
            words: true,
          },
        },
      },
    });

    if (!lessonProgress) {
      throw AppError.notFound('Lesson progress not found');
    }

    if (lessonProgress.status !== 'COMPLETED') {
      throw AppError.badRequest('Only completed lessons can be retaken');
    }

    // Retake should not reset learned state. Completion flow applies sticky-only upgrades,
    // so repeated attempts can improve mastery without losing previously earned progress.

    const lesson = await this.getPublishedLessonById(lessonId);

    const sessionPayload = await this.contentService.buildSessionPayload({
      pathId,
      lesson,
      baseLanguage: path.learner.baseLanguage,
    });

    return {
      ...sessionPayload,
      retake: true,
      lessonId,
    };
  }

  private async checkLessonBadges(learnerId: string, pathId: string, xpEarned: number): Promise<void> {
    const [totalCompleted, path] = await Promise.all([
      this.prisma.learnerScenarioProgress.count({
        where: { learningPathId: pathId, status: 'COMPLETED' },
      }),
      this.prisma.learningPath.findUnique({
        where: { id: pathId },
        select: { pathXp: true },
      }),
    ]);

    await this.badgeService.checkAndAwardBadges({
      type: 'LESSON_COMPLETED',
      learnerId,
      totalLessonsCompleted: totalCompleted,
    });

    if (xpEarned > 0 && path) {
      await this.badgeService.checkAndAwardBadges({
        type: 'XP_EARNED',
        learnerId,
        totalXp: path.pathXp,
      });
    }
  }
}
