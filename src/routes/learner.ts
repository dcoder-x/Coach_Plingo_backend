import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';
import { LearnerController } from '../controllers/LearnerController';

const router = Router();
const prisma = new PrismaClient();
const controller = new LearnerController(prisma);

router.get('/streak', authenticateToken, (req, res, next) =>
  controller.getStreak(req, res, next),
);

export default router;
