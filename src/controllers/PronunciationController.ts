import { Request, Response, NextFunction } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';
import { PronunciationService } from '../services/PronunciationService';
import {
  ClaudeClient,
  PronunciationScoringResult,
} from '../jobs/clients/ClaudeClient';
import { ElevenLabsClient, ElevenLabsTranscriptionResult } from '../jobs/clients/ElevenLabsClient';
import { CloudinaryService } from '../services/CloudinaryService';

export class PronunciationController {
  private pronunciationService: PronunciationService;
  private elevenLabsClient: ElevenLabsClient;
  private claudeClient: ClaudeClient;
  private cloudinaryService: CloudinaryService;
  private logger: SimpleLogger;

  constructor(private prisma: PrismaClient) {
    this.pronunciationService = new PronunciationService(prisma);
    this.elevenLabsClient = new ElevenLabsClient();
    this.claudeClient = new ClaudeClient();
    this.cloudinaryService = new CloudinaryService();
    this.logger = new SimpleLogger('PronunciationController');
  }

  /**
   * GET /pronunciation/reference-audio?word=...&language=...
   * Returns cached pronunciation audio when available; otherwise generates with ElevenLabs and caches it.
   */
  async getReferenceAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startedAtMs = Date.now();
      const word = String(req.query.word || '').trim();
      const language = String(req.query.language || '').trim();
      const wordId = String(req.query.wordId || '').trim();

      // Prefer direct wordId lookup (stable) over text+language search (fragile)
      let vocabularyWord: {
        id: string;
        word: string;
        examplePhrases: Prisma.JsonValue | null;
        exampleSentences: Prisma.JsonValue | null;
      } | null = null;
      let scenarioWord: {
        id: string;
        word: string;
        ipa: string | null;
        examplePhrases: Prisma.JsonValue | null;
        exampleSentences: Prisma.JsonValue | null;
      } | null = null;

      if (wordId) {
        vocabularyWord = await this.prisma.globalVocabularyWord.findUnique({
          where: { id: wordId },
          select: { id: true, word: true, examplePhrases: true, exampleSentences: true },
        });

        if (!vocabularyWord) {
          scenarioWord = await this.prisma.scenarioWord.findUnique({
            where: { id: wordId },
            select: { id: true, word: true, ipa: true, examplePhrases: true, exampleSentences: true },
          });
        }
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
          select: { id: true, word: true, examplePhrases: true, exampleSentences: true },
        });
      }

      if (!scenarioWord && word && !vocabularyWord) {
        scenarioWord = await this.prisma.scenarioWord.findFirst({
          where: {
            word: { equals: word, mode: 'insensitive' },
            lesson: {
              language: { equals: language, mode: 'insensitive' },
            },
          },
          select: { id: true, word: true, ipa: true, examplePhrases: true, exampleSentences: true },
        });
      }

      if (!vocabularyWord && !scenarioWord) {
        this.logger.warn('Reference audio target not found; returning empty payload', {
          word,
          wordId: wordId || null,
          language,
        });
        res.json({
          success: true,
          data: {
            source: 'not_found',
            wordId: wordId || null,
            word: word || null,
            language,
            audioUrl: null,
            ipa: null,
          },
        });
        this.logger.info('Reference audio lookup completed', {
          source: 'not_found',
          word,
          wordId: wordId || null,
          language,
          durationMs: Date.now() - startedAtMs,
        });
        return;
      }

      if (vocabularyWord) {
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
          this.logger.info('Reference audio lookup completed', {
            source: 'cache',
            word: vocabularyWord.word,
            wordId: vocabularyWord.id,
            language,
            durationMs: Date.now() - startedAtMs,
          });
          return;
        }

        const vocabularyContext = this.extractWordSpeechContext(
          vocabularyWord.word,
          vocabularyWord.examplePhrases,
          vocabularyWord.exampleSentences,
        );
        const ttsVoiceId = await ElevenLabsClient.resolveVoiceId(this.prisma, language);
        const generatedAudioDataUri = await this.elevenLabsClient.generateSpeech(vocabularyWord.word, language, {
          singleWordMode: true,
          voiceId: ttsVoiceId,
        });
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
        this.logger.info('Reference audio lookup completed', {
          source: 'generated',
          word: vocabularyWord.word,
          wordId: vocabularyWord.id,
          language,
          durationMs: Date.now() - startedAtMs,
        });
        return;
      }

      const scenarioCached = await this.prisma.wordAudioCache.findUnique({
        where: {
          wordId_language: {
            wordId: scenarioWord!.id,
            language,
          },
        },
      });

      if (scenarioCached) {
        res.json({
          success: true,
          data: {
            source: 'scenario_cache',
            wordId: scenarioWord!.id,
            word: scenarioWord!.word,
            language,
            audioUrl: scenarioCached.audioUrl,
            ipa: null,
          },
        });
        this.logger.info('Reference audio lookup completed', {
          source: 'scenario_cache',
          word: scenarioWord!.word,
          wordId: scenarioWord!.id,
          language,
          durationMs: Date.now() - startedAtMs,
        });
        return;
      }

      const scenarioContext = this.extractWordSpeechContext(
        scenarioWord!.word,
        scenarioWord!.examplePhrases,
        scenarioWord!.exampleSentences,
      );
      const ttsVoiceId = await ElevenLabsClient.resolveVoiceId(this.prisma, language);
      const generatedScenarioAudioDataUri = await this.elevenLabsClient.generateSpeech(scenarioWord!.word, language, {
        singleWordMode: true,
        voiceId: ttsVoiceId,
        ipa: scenarioWord!.ipa ?? undefined,
      });
      const uploadedScenarioAudio = await this.cloudinaryService.uploadAudioDataUri(
        generatedScenarioAudioDataUri,
        'coach-plingo/pronunciation/scenario',
      );

      const savedScenarioAudio = await this.prisma.wordAudioCache.create({
        data: {
          wordId: scenarioWord!.id,
          language,
          audioUrl: uploadedScenarioAudio.secureUrl,
        },
      });

      res.json({
        success: true,
        data: {
          source: 'scenario_generated',
          wordId: scenarioWord!.id,
          word: scenarioWord!.word,
          language,
          audioUrl: savedScenarioAudio.audioUrl,
          ipa: null,
        },
      });
      this.logger.info('Reference audio lookup completed', {
        source: 'scenario_generated',
        word: scenarioWord!.word,
        wordId: scenarioWord!.id,
        language,
        durationMs: Date.now() - startedAtMs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /pronunciation/attempts
   * Stores learner pronunciation score for an exercise or scenario word.
   * accuracyScore is expected on a 0-100 scale.
   */
  async recordAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const { exerciseId, wordId, recordedAudioUrl, accuracyScore } = req.body as {
        exerciseId?: string | null;
        wordId?: string | null;
        recordedAudioUrl: string;
        accuracyScore: number;
      };

      const attempt = await this.pronunciationService.recordAttempt({
        exerciseId: exerciseId ?? null,
        wordId: wordId ?? null,
        learnerId: req.learnerId,
        recordedAudioUrl,
        accuracyScore,
      });

      res.json({
        success: true,
        data: {
          attempt: {
            id: attempt.id,
            exerciseId: attempt.exerciseId,
            wordId: attempt.wordId,
            accuracyScore: Number(attempt.accuracyScore),
            passed: attempt.passed,
            attemptedAt: attempt.attemptedAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /pronunciation/score-attempt
   * POST /pronunciation/score
   * Computes a continuous pronunciation score server-side from ElevenLabs STT,
   * LLM grading, and deterministic similarity checks, then records the attempt.
   */
  async scoreAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    let uploadedAudioPublicId: string | null = null;
    let cleanupAudioUrl: string | null = null;

    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      // Extract path params and body params
      const pathParams = req.params as Record<string, string | undefined>;
      const bodyParams = req.body as Record<string, unknown>;

      const exerciseId = pathParams.exerciseId || bodyParams.exerciseId;
      const wordId = pathParams.wordId || bodyParams.wordId;
      const pathId = pathParams.pathId || bodyParams.pathId;
      const lessonId = pathParams.lessonId || bodyParams.lessonId;
      const languageCode = bodyParams.languageCode as string;

      // For V3 flow: audio file is required; for legacy: recordedAudioUrl is required
      const audioFile = (req as Request & { file?: Express.Multer.File }).file;
      const recordedAudioUrl = bodyParams.recordedAudioUrl as string;

      if (!exerciseId && !wordId) {
        throw AppError.badRequest('Either exerciseId or wordId is required');
      }

      if (!languageCode) {
        throw AppError.badRequest('languageCode is required');
      }

      this.logger.info('[1/5] Starting pronunciation scoring pipeline', {
        exerciseId: exerciseId || null,
        wordId: wordId || null,
        pathId: pathId || null,
        lessonId: lessonId || null,
        languageCode,
        hasFileUpload: Boolean(audioFile),
        hasRemoteUrl: Boolean(recordedAudioUrl),
      });

      // Determine audio URL: either from uploaded file or provided URL
      let audioUrl: string;
      if (audioFile) {
        this.logger.info('[2/5] Uploading audio to Cloudinary', {
          mimetype: audioFile.mimetype,
          sizeBytes: audioFile.buffer?.length ?? 0,
        });
        const uploaded = await this.cloudinaryService.uploadAudioBuffer(
          audioFile.buffer,
          audioFile.mimetype,
          'pronunciation_attempts',
        );
        audioUrl = uploaded.secureUrl;
        uploadedAudioPublicId = uploaded.publicId;
        this.logger.info('[2/5] Cloudinary upload complete', { audioUrl });
      } else if (recordedAudioUrl) {
        this.logger.info('[2/5] Using pre-uploaded audio URL (legacy)', { recordedAudioUrl });
        audioUrl = recordedAudioUrl;
        cleanupAudioUrl = recordedAudioUrl;
      } else {
        throw AppError.badRequest('Either audio file or recordedAudioUrl is required');
      }

      const target = await this.resolvePronunciationTarget({
        learnerId: req.learnerId,
        exerciseId: exerciseId as string,
        wordId: wordId as string,
        pathId: pathId as string,
        lessonId: lessonId as string,
      });
      if (!target) {
        throw AppError.notFound('Pronunciation target not found');
      }

      if (target.learningPathOwnerId !== req.learnerId) {
        throw AppError.forbidden('Not authorized');
      }

      this.logger.info('[3/5] Sending audio to ElevenLabs STT', {
        targetText: target.targetText,
        languageCode,
        audioUrl,
      });
      const sttResult = await this.elevenLabsClient.transcribeFromUrl(audioUrl, languageCode);
      const targetText = target.targetText;
      const transcriptText = sttResult?.text || '';
      const transcriptConfidence = this.computeTranscriptConfidence(sttResult);
      this.logger.info('[3/5] ElevenLabs STT result', {
        transcript: transcriptText,
        detectedLanguage: sttResult?.languageCode || null,
        transcriptConfidence,
        wordCount: sttResult?.words?.length ?? 0,
      });

      const similarityBreakdown = this.computeSimilarityScore(targetText, transcriptText);
      this.logger.info('[4/5] Similarity scores computed', {
        targetText,
        transcriptText,
        characterScore: similarityBreakdown.characterScore,
        tokenScore: similarityBreakdown.tokenScore,
        finalScore: similarityBreakdown.finalScore,
        errorType: similarityBreakdown.errorType,
      });

      this.logger.info('[5/5] Sending to LLM for pronunciation grading', {
        targetText,
        transcriptText,
        languageCode,
        ipa: target.ipa ?? null,
        baseSimilarityScore: similarityBreakdown.finalScore,
        transcriptConfidence,
      });
      const llmGrade = await this.claudeClient.gradePronunciation({
        targetText,
        transcriptText,
        languageCode,
        ipa: target.ipa ?? null,
        professionContext: target.professionContext,
        lessonContext: target.lessonContext,
        baseSimilarityScore: similarityBreakdown.finalScore,
        transcriptConfidence,
      });
      this.logger.info('[5/5] LLM grading result', {
        llmScore: llmGrade?.score ?? null,
        feedback: llmGrade?.feedback ?? null,
        errorType: llmGrade?.errorType ?? null,
      });

      const score100 = this.combinePronunciationScores({
        llmGrade,
        similarityScore: similarityBreakdown.finalScore,
        transcriptConfidence,
      });
      const scoringSource = llmGrade ? 'elevenlabs_stt_llm_similarity' : 'elevenlabs_stt_similarity';

      this.logger.info('Final blended score', {
        llmScore: llmGrade?.score ?? null,
        similarityScore: similarityBreakdown.finalScore,
        transcriptConfidence,
        finalScore: score100,
        passed: score100 >= 70,
        scoringSource,
      });

      const attempt = await this.pronunciationService.recordAttempt({
        exerciseId: (exerciseId as string) ?? null,
        wordId: (wordId as string) ?? null,
        learnerId: req.learnerId,
        recordedAudioUrl: audioUrl,
        accuracyScore: score100,
      });

      // Build attempt response — omit null identifier to keep the response clean
      const attemptResponse = wordId
        ? {
          id: attempt.id,
          wordId: attempt.wordId,
          accuracyScore: Number(attempt.accuracyScore),
          passed: attempt.passed,
          attemptedAt: attempt.attemptedAt,
        }
        : {
          id: attempt.id,
          exerciseId: attempt.exerciseId,
          accuracyScore: Number(attempt.accuracyScore),
          passed: attempt.passed,
          attemptedAt: attempt.attemptedAt,
        };

      res.json({
        success: true,
        data: {
          attempt: attemptResponse,
          scoringSource,
          transcriptUsed: transcriptText || null,
          targetText,
          detectedLanguage: sttResult?.languageCode || null,
          transcriptConfidence,
          similarityScore: similarityBreakdown.finalScore,
          similarityBreakdown,
          llmScore: llmGrade?.score ?? null,
          feedback: llmGrade?.feedback ?? similarityBreakdown.feedback,
          errorType: llmGrade?.errorType ?? similarityBreakdown.errorType,
        },
      });
    } catch (error) {
      next(error);
    } finally {
      try {
        if (uploadedAudioPublicId) {
          await this.cloudinaryService.deleteAudio(uploadedAudioPublicId);
          this.logger.info('Deleted temporary learner pronunciation audio', {
            publicId: uploadedAudioPublicId,
          });
        } else if (cleanupAudioUrl) {
          await this.cloudinaryService.deleteAudioByUrl(cleanupAudioUrl);
          this.logger.info('Deleted legacy learner pronunciation audio by URL', {
            audioUrl: cleanupAudioUrl,
          });
        }
      } catch (cleanupError) {
        this.logger.warn('Failed to delete temporary learner pronunciation audio', {
          cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          publicId: uploadedAudioPublicId,
          audioUrl: cleanupAudioUrl,
        });
      }
    }
  }

  private async resolvePronunciationTarget(input: {
    learnerId: string;
    exerciseId?: string;
    wordId?: string;
    pathId?: string;
    lessonId?: string;
  }): Promise<{
    targetText: string;
    ipa?: string | null;
    professionContext?: string | null;
    lessonContext?: string | null;
    learningPathOwnerId: string;
  } | null> {
    if (input.exerciseId) {
      const exercise = await this.prisma.pronunciationExercise.findUnique({
        where: { id: input.exerciseId },
        include: {
          milestone: {
            include: {
              learningPath: true,
            },
          },
        },
      });

      if (!exercise) {
        return null;
      }

      if (exercise.milestone.learningPath.learnerId !== input.learnerId) {
        return null;
      }

      return {
        targetText: exercise.targetText,
        learningPathOwnerId: exercise.milestone.learningPath.learnerId,
      };
    }

    if (input.wordId && input.pathId && input.lessonId) {
      const progress = await this.prisma.learnerScenarioProgress.findUnique({
        where: {
          learningPathId_lessonId: {
            learningPathId: input.pathId,
            lessonId: input.lessonId,
          },
        },
        include: {
          learningPath: true,
          lesson: {
            include: {
              subcategory: {
                include: {
                  profession: true,
                },
              },
              scenario: true,
            },
          },
        },
      });

      if (!progress || progress.learningPath.learnerId !== input.learnerId) {
        return null;
      }

      const word = await this.prisma.scenarioWord.findUnique({
        where: { id: input.wordId },
        include: {
          lesson: {
            include: {
              subcategory: {
                include: {
                  profession: true,
                },
              },
              scenario: true,
            },
          },
        },
      });

      if (!word || word.lessonId !== input.lessonId) {
        return null;
      }

      return {
        targetText: word.word,
        ipa: word.ipa ?? null,
        professionContext: `${word.lesson.subcategory.profession.name}${word.lesson.subcategory.profession.description ? ` — ${word.lesson.subcategory.profession.description}` : ''}`,
        lessonContext: `${word.lesson.subcategory.name} / ${word.lesson.scenario.displayName}`,
        learningPathOwnerId: progress.learningPath.learnerId,
      };
    }

    return null;
  }

  private combinePronunciationScores(input: {
    llmGrade: PronunciationScoringResult | null;
    similarityScore: number;
    transcriptConfidence: number | null;
  }): number {
    const llmScore = input.llmGrade?.score;
    const baseScore = Math.max(0, Math.min(100, input.similarityScore));
    const confidenceScore = input.transcriptConfidence ?? null;

    let combined = typeof llmScore === 'number'
      ? (llmScore * 0.65) + (baseScore * 0.35)
      : baseScore;

    if (typeof confidenceScore === 'number') {
      combined = (combined * 0.85) + (confidenceScore * 0.15);
    }

    return Math.max(0, Math.min(100, Math.round(combined)));
  }

  private computeSimilarityScore(targetText: string, transcript: string): {
    finalScore: number;
    characterScore: number;
    tokenScore: number;
    errorType: 'none' | 'wrong_word' | 'missing_sound' | 'stress' | 'vowel' | 'consonant' | 'unclear' | 'other';
    feedback: string;
  } {
    const normalizedTarget = this.normalizeForScoring(targetText);
    const normalizedTranscript = this.normalizeForScoring(transcript);

    if (!normalizedTarget || !normalizedTranscript) {
      return {
        finalScore: 0,
        characterScore: 0,
        tokenScore: 0,
        errorType: 'unclear',
        feedback: 'The transcript was too unclear to score confidently.',
      };
    }

    const characterScore = this.calculateLevenshteinSimilarity(normalizedTarget, normalizedTranscript);
    const tokenScore = this.calculateTokenSimilarity(normalizedTarget, normalizedTranscript);
    const finalScore = Math.round((characterScore * 0.7) + (tokenScore * 0.3));

    let errorType: 'none' | 'wrong_word' | 'missing_sound' | 'stress' | 'vowel' | 'consonant' | 'unclear' | 'other' = 'other';
    if (normalizedTarget === normalizedTranscript || normalizedTranscript.split(' ').includes(normalizedTarget)) {
      errorType = 'none';
    } else if (finalScore >= 80) {
      errorType = 'missing_sound';
    } else if (finalScore >= 60) {
      errorType = 'vowel';
    } else if (finalScore >= 40) {
      errorType = 'consonant';
    } else {
      errorType = 'wrong_word';
    }

    return {
      finalScore,
      characterScore,
      tokenScore,
      errorType,
      feedback: finalScore >= 80
        ? 'Your pronunciation was very close to the target word.'
        : finalScore >= 60
          ? 'The word was recognizable, but there was a noticeable pronunciation error.'
          : finalScore >= 40
            ? 'The attempt was partly related to the target word, but several sounds were off.'
            : 'The transcript did not clearly match the target word.',
    };
  }

  private calculateLevenshteinSimilarity(left: string, right: string): number {
    const a = left;
    const b = right;
    const aLength = a.length;
    const bLength = b.length;

    if (aLength === 0 || bLength === 0) {
      return 0;
    }

    const matrix: number[][] = Array.from({ length: aLength + 1 }, (_, row) =>
      Array.from({ length: bLength + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
    );

    for (let row = 1; row <= aLength; row += 1) {
      for (let col = 1; col <= bLength; col += 1) {
        const cost = a[row - 1] === b[col - 1] ? 0 : 1;
        matrix[row][col] = Math.min(
          matrix[row - 1][col] + 1,
          matrix[row][col - 1] + 1,
          matrix[row - 1][col - 1] + cost,
        );
      }
    }

    const distance = matrix[aLength][bLength];
    const maxLength = Math.max(aLength, bLength);
    return Math.max(0, Math.min(100, Math.round((1 - distance / maxLength) * 100)));
  }

  private calculateTokenSimilarity(target: string, transcript: string): number {
    const targetTokens = target.split(' ').filter(Boolean);
    const transcriptTokens = transcript.split(' ').filter(Boolean);

    if (targetTokens.length === 0 || transcriptTokens.length === 0) {
      return 0;
    }

    const matchedTokens = targetTokens.filter((token) => transcriptTokens.includes(token)).length;
    return Math.max(0, Math.min(100, Math.round((matchedTokens / targetTokens.length) * 100)));
  }

  private computeTranscriptConfidence(result: ElevenLabsTranscriptionResult | null): number | null {
    if (!result || !Array.isArray(result.words) || result.words.length === 0) {
      return null;
    }

    const scoredWords = result.words.filter(
      (word) => word.type === 'word' && typeof word.logprob === 'number',
    );

    if (scoredWords.length === 0) {
      return null;
    }

    const avgLogprob =
      scoredWords.reduce((sum, word) => sum + Number(word.logprob), 0) /
      scoredWords.length;

    const normalized = Math.max(0, Math.min(100, Math.round((avgLogprob + 2.5) * 40)));
    return normalized;
  }

  private normalizeForScoring(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractWordSpeechContext(
    word: string,
    examplePhrases: Prisma.JsonValue | null,
    exampleSentences: Prisma.JsonValue | null,
  ): { previousText?: string; nextText?: string } {
    const candidates = [
      ...this.extractPhraseTexts(examplePhrases),
      ...this.extractSentenceTemplates(exampleSentences, word),
    ];

    for (const candidate of candidates) {
      const context = this.extractContextAroundWord(candidate, word);
      if (context) {
        return context;
      }
    }

    return {};
  }

  private extractPhraseTexts(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is Prisma.JsonObject => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
      .map((entry) => (typeof entry['text'] === 'string' ? (entry['text'] as string).trim() : ''))
      .filter((entry) => entry.length > 0);
  }

  private extractSentenceTemplates(value: Prisma.JsonValue | null, fallbackWord: string): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is Prisma.JsonObject => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
      .map((entry) => {
        const template = typeof entry['template'] === 'string' ? (entry['template'] as string) : '';
        const answer = typeof entry['answer'] === 'string' ? (entry['answer'] as string) : fallbackWord;
        if (!template) {
          return '';
        }
        return template.includes('___') ? template.replace('___', answer) : template;
      })
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
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

  /**
   * POST /pronunciation/upload
   * Accepts FormData with audio file and returns a CDN URL
   */
  async uploadPronunciationAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const audioFile = (req as Request & { file?: Express.Multer.File }).file;
      if (!audioFile?.buffer) {
        throw AppError.badRequest('No audio file provided');
      }

      const mimeType = audioFile.mimetype || 'audio/m4a';
      const dataUri = `data:${mimeType};base64,${audioFile.buffer.toString('base64')}`;

      const uploaded = await this.cloudinaryService.uploadAudioDataUri(
        dataUri,
        'coach-plingo/learner-pronunciation',
      );

      res.json({
        success: true,
        data: {
          audioUrl: uploaded.secureUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
