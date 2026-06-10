import { Router } from 'express';
import { authenticateAdmin } from '../../middleware/adminAuth';
import adminAuthRoutes from './auth';
import { createLessonsRouter } from './lessons';
import { createContentRouter } from './content';
import { createMetricsRouter } from './metrics';

const router = Router();

// Public admin auth (no JWT required)
router.use('/auth', adminAuthRoutes);

// All routes below require admin JWT
router.use(authenticateAdmin);
router.use('/lessons', createLessonsRouter());
router.use('/content', createContentRouter());
router.use('/metrics', createMetricsRouter());

export default router;
