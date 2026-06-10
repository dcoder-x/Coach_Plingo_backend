import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AdminLessonsController } from '../../controllers/AdminLessonsController';

const prisma = new PrismaClient();

export function createLessonsRouter(): Router {
  const router = Router();
  const controller = new AdminLessonsController(prisma);

  router.get('/', (req, res) => controller.list(req, res));
  router.get('/:id', (req, res) => controller.get(req, res));
  router.patch('/:id/status', (req, res) => controller.updateStatus(req, res));
  router.delete('/:id', (req, res) => controller.deleteLesson(req, res));
  router.patch('/:id/words/:wordId', (req, res) => controller.updateWord(req, res));
  router.post('/:id/words/:wordId/audio', (req, res) => controller.regenerateAudio(req, res));
  router.post('/generate', (req, res) => controller.generate(req, res));

  return router;
}
