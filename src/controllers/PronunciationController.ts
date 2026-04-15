import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { PronunciationService } from '../services/PronunciationService';
import { ElevenLabsClient } from '../jobs/clients/ElevenLabsClient';
import { CloudinaryService } from '../services/CloudinaryService';

export class PronunciationController {
  private pronunciationService: PronunciationService;
  private elevenLabsClient: ElevenLabsClient;
  private cloudinaryService: CloudinaryService;

  constructor(private prisma: PrismaClient) {
    this.pronunciationService = new PronunciationService(prisma);
    this.elevenLabsClient = new ElevenLabsClient();
    this.cloudinaryService = new CloudinaryService();
  }

  /**
   * GET /pronunciation/reference-audio?word=...&language=...
   * Returns cached global pronunciation audio if available; otherwise generates with ElevenLabs and caches it.
   */
  async getReferenceAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const word = String(req.query.word || '').trim();
      const language = String(req.query.language || '').trim();
      const wordId = String(req.query.wordId || '').trim();

      // Prefer direct wordId lookup (stable) over text+language search (fragile)
      let vocabularyWord: { id: string; word: string } | null = null;

      if (wordId) {
        vocabularyWord = await this.prisma.globalVocabularyWord.findUnique({
          where: { id: wordId },
          select: { id: true, word: true },
        });
      }

      if (!vocabularyWord && word) {
        vocabularyWord = await this.prisma.globalVocabularyWord.findFirst({
          where: {
            word: { equals: word, mode: 'insensitive' },
            ...(language ? {
              vocabularySet: {
                language: { equals: language, mode: 'insensitive' },
              },
            } : {}),
          },
          select: { id: true, word: true },
        });
      }

      if (!vocabularyWord) {
        throw AppError.notFound('Word not found in global vocabulary set for this language');
      }

      const cached = await this.pronunciationService.getCachedAudio(vocabularyWord.id, language);

      if (cached) {
        res.json({
          success: true,
          data: {
            source: 'cache',
            wordId: vocabularyWord.id,
            word: vocabularyWord.word,
            language,
            audioUrl: cached.audioUrl,
            ipa: cached.ipa ?? null,
          },
        });
        return;
      }

      const generatedAudioDataUri = await this.elevenLabsClient.generateSpeech(vocabularyWord.word);
      const uploadedAudio = await this.cloudinaryService.uploadAudioDataUri(
        generatedAudioDataUri,
        'coach-plingo/pronunciation',
      );

      const saved = await this.pronunciationService.cacheAudio({
        wordId: vocabularyWord.id,
        language,
        audioUrl: uploadedAudio.secureUrl,
      });

      res.json({
        success: true,
        data: {
          source: 'generated',
          wordId: vocabularyWord.id,
          word: vocabularyWord.word,
          language,
          audioUrl: saved.audioUrl,
          ipa: saved.ipa ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /pronunciation/attempts
   * Stores learner pronunciation score for an exercise.
   * accuracyScore is expected from external pronunciation scoring (e.g. ElevenLabs) on a 0-100 scale.
   */
  async recordAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { exerciseId, recordedAudioUrl, accuracyScore } = req.body;

      const exercise = await this.prisma.pronunciationExercise.findUnique({
        where: { id: exerciseId },
        include: {
          milestone: {
            include: {
              learningPath: true,
            },
          },
        },
      });

      if (!exercise) {
        throw AppError.notFound('Pronunciation exercise not found');
      }

      if (exercise.milestone.learningPath.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      const attempt = await this.pronunciationService.recordAttempt({
        exerciseId,
        learnerId: req.learnerId,
        recordedAudioUrl,
        accuracyScore,
      });

      const milestoneProgress = await this.pronunciationService.getMilestoneProgress(
        exercise.milestoneId,
      );

      let pathCompleted = false;
      if (milestoneProgress.isComplete && exercise.milestone.milestoneNumber === 3) {
        const currentPath = await this.prisma.learningPath.findUnique({
          where: { id: exercise.milestone.learningPathId },
        });

        if (currentPath && currentPath.status !== 'COMPLETED') {
          await this.prisma.learningPath.update({
            where: { id: currentPath.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });

          await this.prisma.milestone.update({
            where: {
              learningPathId_milestoneNumber: {
                learningPathId: currentPath.id,
                milestoneNumber: 3,
              },
            },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });

          pathCompleted = true;
        }
      }

      res.json({
        success: true,
        data: {
          attempt: {
            id: attempt.id,
            exerciseId: attempt.exerciseId,
            accuracyScore: Number(attempt.accuracyScore),
            passed: attempt.passed,
            attemptedAt: attempt.attemptedAt,
          },
          milestoneProgress,
          pathCompleted,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /pronunciation/score-attempt
   * Computes accuracy score server-side from transcript similarity to target text,
   * then records the attempt. If externalAccuracyScore is provided, it is used directly.
   */
  async scoreAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { exerciseId, recordedAudioUrl, transcript, externalAccuracyScore } = req.body as {
        exerciseId: string;
        recordedAudioUrl: string;
        transcript?: string;
        externalAccuracyScore?: number;
      };

      const exercise = await this.prisma.pronunciationExercise.findUnique({
        where: { id: exerciseId },
        include: {
          milestone: {
            include: {
              learningPath: true,
            },
          },
        },
      });

      if (!exercise) {
        throw AppError.notFound('Pronunciation exercise not found');
      }

      if (exercise.milestone.learningPath.learnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      let score100: number;
      let scoringSource: 'external' | 'transcript_similarity';

      if (typeof externalAccuracyScore === 'number') {
        score100 = externalAccuracyScore;
        scoringSource = 'external';
      } else {
        score100 = this.computeTranscriptAccuracy(exercise.targetText, transcript || '');
        scoringSource = 'transcript_similarity';
      }

      const attempt = await this.pronunciationService.recordAttempt({
        exerciseId,
        learnerId: req.learnerId,
        recordedAudioUrl,
        accuracyScore: score100,
      });

      const milestoneProgress = await this.pronunciationService.getMilestoneProgress(
        exercise.milestoneId,
      );

      let pathCompleted = false;
      if (milestoneProgress.isComplete && exercise.milestone.milestoneNumber === 3) {
        const currentPath = await this.prisma.learningPath.findUnique({
          where: { id: exercise.milestone.learningPathId },
        });

        if (currentPath && currentPath.status !== 'COMPLETED') {
          await this.prisma.learningPath.update({
            where: { id: currentPath.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });

          await this.prisma.milestone.update({
            where: {
              learningPathId_milestoneNumber: {
                learningPathId: currentPath.id,
                milestoneNumber: 3,
              },
            },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });

          pathCompleted = true;
        }
      }

      res.json({
        success: true,
        data: {
          attempt: {
            id: attempt.id,
            exerciseId: attempt.exerciseId,
            accuracyScore: Number(attempt.accuracyScore),
            passed: attempt.passed,
            attemptedAt: attempt.attemptedAt,
          },
          scoringSource,
          transcriptUsed: transcript || null,
          targetText: exercise.targetText,
          milestoneProgress,
          pathCompleted,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  private computeTranscriptAccuracy(targetText: string, transcript: string): number {
    const normalizedTarget = this.normalizeForScoring(targetText);
    const normalizedTranscript = this.normalizeForScoring(transcript);

    if (!normalizedTarget || !normalizedTranscript) {
      return 0;
    }

    const distance = this.levenshtein(normalizedTarget, normalizedTranscript);
    const maxLen = Math.max(normalizedTarget.length, normalizedTranscript.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

    const clamped = Math.max(0, Math.min(1, similarity));
    return Math.round(clamped * 10000) / 100;
  }

  private normalizeForScoring(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i += 1) dp[i][0] = i;
    for (let j = 0; j <= n; j += 1) dp[0][j] = j;

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }
}
