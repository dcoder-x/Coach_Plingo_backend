import { Router } from 'express';
import { AdminMetricsController } from '../../controllers/AdminMetricsController';
import prisma from '../../lib/prisma';

export function createMetricsRouter(): Router {
  const router = Router();
  const controller = new AdminMetricsController(prisma);

  router.get('/overview', (req, res) => controller.overview(req, res));

  return router;
}
