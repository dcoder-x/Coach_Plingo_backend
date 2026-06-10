import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createContentRouter(): Router {
  const router = Router();

  router.get('/languages', async (_req: Request, res: Response) => {
    const languages = await prisma.languageOption.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });
    res.json({ success: true, data: languages });
  });

  router.get('/professions', async (_req: Request, res: Response) => {
    const professions = await prisma.professionOption.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        subCategories: {
          orderBy: { position: 'asc' },
          select: { id: true, name: true, slug: true, position: true },
        },
        scenarios: {
          orderBy: { position: 'asc' },
          select: { id: true, displayName: true, slug: true, position: true },
        },
      },
    });
    res.json({ success: true, data: professions });
  });

  return router;
}
