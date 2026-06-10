import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

export class AdminMetricsController {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(_req: Request, res: Response): Promise<void> {
    const [
      totalLearners,
      verifiedLearners,
      lessonsByStatus,
      lessonsByLanguage,
      recentLearners,
      totalPaths,
      activePaths,
    ] = await Promise.all([
      this.prisma.learner.count(),
      this.prisma.learner.count({ where: { emailVerified: true } }),
      this.prisma.scenarioLesson.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.scenarioLesson.groupBy({
        by: ['language'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.learner.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, fullName: true, email: true, profession: true, createdAt: true },
      }),
      this.prisma.learningPath.count(),
      this.prisma.learningPath.count({ where: { status: 'ACTIVE' } }),
    ]);

    const statusMap = Object.fromEntries(
      lessonsByStatus.map((row) => [row.status, row._count.id]),
    );

    res.json({
      success: true,
      data: {
        learners: {
          total: totalLearners,
          verified: verifiedLearners,
          recent: recentLearners,
        },
        lessons: {
          draft: statusMap['DRAFT'] ?? 0,
          reviewed: statusMap['REVIEWED'] ?? 0,
          published: statusMap['PUBLISHED'] ?? 0,
          byLanguage: lessonsByLanguage.map((r) => ({ language: r.language, count: r._count.id })),
        },
        paths: {
          total: totalPaths,
          active: activePaths,
        },
      },
    });
  }
}
