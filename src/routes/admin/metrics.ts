import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AdminMetricsController } from '../../controllers/AdminMetricsController';

const prisma = new PrismaClient();

export function createMetricsRouter(): Router {
  const router = Router();
  const controller = new AdminMetricsController(prisma);

  router.get('/overview', (req, res) => controller.overview(req, res));

  return router;
}
