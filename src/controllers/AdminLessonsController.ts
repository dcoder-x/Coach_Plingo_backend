import { Request, Response } from 'express';
import { PrismaClient, LessonStatus } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { ContentService } from '../services/ContentService';
import { ElevenLabsClient } from '../jobs/clients/ElevenLabsClient';
import { CloudinaryService } from '../services/CloudinaryService';
import { SimpleLogger } from '../utils/Logger';

const logger = new SimpleLogger('AdminLessonsController');

type ListQuery = {
  language?: string;
  professionId?: string;
  subcategoryId?: string;
  scenarioId?: string;
  status?: string;
  page?: string;
  limit?: string;
};

export class AdminLessonsController {
  private readonly contentService: ContentService;
  private readonly ttsClient: ElevenLabsClient;
  private readonly cloudinaryService: CloudinaryService;

  constructor(private readonly prisma: PrismaClient) {
    this.contentService = new ContentService(prisma);
    this.ttsClient = new ElevenLabsClient();
    this.cloudinaryService = new CloudinaryService();
  }

  async list(req: Request, res: Response): Promise<void> {
    const { language, professionId, subcategoryId, scenarioId, status, page = '1', limit = '20' } =
      req.query as ListQuery;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (language) where.language = language;
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (scenarioId) where.scenarioId = scenarioId;
    if (status && ['DRAFT', 'REVIEWED', 'PUBLISHED'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase() as LessonStatus;
    }

    if (professionId) {
      where.subcategory = { professionId };
    }

    const [lessons, total] = await Promise.all([
      this.prisma.scenarioLesson.findMany({
        where,
        include: {
          subcategory: { select: { id: true, name: true, slug: true, professionId: true } },
          scenario: { select: { id: true, displayName: true, slug: true } },
          _count: { select: { words: true, comprehensions: true } },
        },
        orderBy: [{ language: 'asc' }, { subcategoryId: 'asc' }, { scenarioPosition: 'asc' }],
        skip,
        take: limitNum,
      }),
      this.prisma.scenarioLesson.count({ where }),
    ]);

    res.json({
      success: true,
      data: lessons,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  }

  async get(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const lesson = await this.prisma.scenarioLesson.findUnique({
      where: { id },
      include: {
        subcategory: {
          select: {
            id: true, name: true, slug: true,
            profession: { select: { id: true, name: true, slug: true } },
          },
        },
        scenario: { select: { id: true, displayName: true, slug: true, description: true } },
        words: {
          include: { translations: true, audioCache: true },
          orderBy: { position: 'asc' },
        },
        comprehensions: {
          include: { questions: { orderBy: { position: 'asc' } } },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!lesson) throw AppError.notFound('Lesson not found');

    res.json({ success: true, data: lesson });
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { status } = req.body as { status?: string };

    const validStatuses: LessonStatus[] = ['DRAFT', 'REVIEWED', 'PUBLISHED'];
    if (!status || !validStatuses.includes(status.toUpperCase() as LessonStatus)) {
      throw AppError.badRequest(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const normalized = status.toUpperCase() as LessonStatus;
    const updateData: Record<string, unknown> = { status: normalized };
    if (normalized === 'REVIEWED') updateData.reviewedAt = new Date();
    if (normalized === 'PUBLISHED') updateData.publishedAt = new Date();

    const lesson = await this.prisma.scenarioLesson.update({
      where: { id },
      data: updateData,
      select: { id: true, status: true, reviewedAt: true, publishedAt: true },
    });

    res.json({ success: true, data: lesson });
  }

  async updateWord(req: Request, res: Response): Promise<void> {
    const { wordId } = req.params;
    const body = req.body as {
      word?: string;
      ipa?: string;
      complexityLevel?: string;
      examplePhrases?: unknown;
      fillGapSentences?: unknown;
      tags?: unknown;
    };

    const validLevels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
    if (body.complexityLevel && !validLevels.includes(body.complexityLevel.toUpperCase())) {
      throw AppError.badRequest('complexityLevel must be BEGINNER, INTERMEDIATE, or ADVANCED');
    }

    const updateData: Record<string, unknown> = {};
    if (body.word !== undefined) updateData.word = body.word.trim();
    if (body.ipa !== undefined) updateData.ipa = body.ipa.trim();
    if (body.complexityLevel !== undefined) updateData.complexityLevel = body.complexityLevel.toUpperCase();
    if (body.examplePhrases !== undefined) updateData.examplePhrases = body.examplePhrases;
    if (body.fillGapSentences !== undefined) updateData.exampleSentences = body.fillGapSentences;
    if (body.tags !== undefined) updateData.tags = body.tags;

    if (Object.keys(updateData).length === 0) {
      throw AppError.badRequest('No valid fields to update');
    }

    const word = await this.prisma.scenarioWord.update({
      where: { id: wordId },
      data: updateData,
      include: { translations: true },
    });

    res.json({ success: true, data: word });
  }

  async deleteLesson(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const existing = await this.prisma.scenarioLesson.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw AppError.notFound('Lesson not found');

    await this.prisma.scenarioLesson.delete({ where: { id } });

    res.json({ success: true });
  }

  async regenerateAudio(req: Request, res: Response): Promise<void> {
    const { id, wordId } = req.params;

    const lesson = await this.prisma.scenarioLesson.findUnique({
      where: { id },
      select: { id: true, language: true },
    });
    if (!lesson) throw AppError.notFound('Lesson not found');

    const word = await this.prisma.scenarioWord.findUnique({
      where: { id: wordId },
      select: { id: true, word: true, ipa: true },
    });
    if (!word) throw AppError.notFound('Word not found');

    const ttsVoiceId = await ElevenLabsClient.resolveVoiceId(this.prisma, lesson.language);
    const audioData = await this.ttsClient.generateSpeech(word.word, lesson.language, {
      singleWordMode: true,
      voiceId: ttsVoiceId,
      ipa: word.ipa ?? undefined,
    });
    if (!audioData) throw AppError.internal('TTS client returned no audio');

    const uploaded = await this.cloudinaryService.uploadAudioDataUri(
      audioData,
      `coachplingo/lesson-audio/${lesson.language}`,
    );

    const cache = await this.prisma.wordAudioCache.upsert({
      where: { wordId_language: { wordId: word.id, language: lesson.language } },
      update: { audioUrl: uploaded.secureUrl },
      create: { wordId: word.id, language: lesson.language, audioUrl: uploaded.secureUrl },
    });

    logger.info(`Regenerated audio for word ${word.id} (${lesson.language})`);

    res.json({ success: true, data: { audioUrl: cache.audioUrl, language: cache.language } });
  }

  async generate(req: Request, res: Response): Promise<void> {
    const { professionId, subcategoryId, scenarioId, language, baseLanguage = 'en', forceRegenerate } =
      req.body as {
        professionId?: string;
        subcategoryId?: string;
        scenarioId?: string;
        language?: string;
        baseLanguage?: string;
        forceRegenerate?: boolean;
      };

    if (!professionId || !subcategoryId || !scenarioId || !language) {
      throw AppError.badRequest('professionId, subcategoryId, scenarioId, and language are required');
    }

    if (forceRegenerate) {
      const existing = await this.prisma.scenarioLesson.findUnique({
        where: { subcategoryId_scenarioId_language: { subcategoryId, scenarioId, language } },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.scenarioLesson.delete({ where: { id: existing.id } });
        logger.info('Force-deleted existing lesson before regeneration', { subcategoryId, scenarioId, language });
      }
    }

    const result = await this.contentService.getOrGenerateLesson({
      professionId,
      subcategoryId,
      scenarioId,
      language,
      baseLanguage,
    });

    if (!result.ready) {
      res.status(202).json({ success: true, status: 'PREPARING', message: 'Lesson generation is in progress' });
      return;
    }

    res.json({ success: true, status: 'PUBLISHED', lessonId: result.lesson.id });
  }
}
