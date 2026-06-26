import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { LearnerController } from '../controllers/LearnerController';
import prisma from '../lib/prisma';

const router = Router();
const controller = new LearnerController(prisma);

router.get('/streak', authenticateToken, (req, res, next) =>
  controller.getStreak(req, res, next),
);

export default router;
