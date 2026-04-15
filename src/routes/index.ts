import { Router } from 'express';
import authRoutes from './auth';
import learningRoutes from './learning';
import vocabularyRoutes from './vocabulary';
import progressRoutes from './progress';
import pronunciationRoutes from './pronunciation';
import notificationRoutes from './notifications';
import jobRoutes from './jobs';
import catalogRoutes from './catalog';
import learnerRoutes from './learner';

const router = Router();

router.use('/auth', authRoutes);
router.use('/learning', learningRoutes);
router.use('/vocabulary', vocabularyRoutes);
router.use('/progress', progressRoutes);
router.use('/pronunciation', pronunciationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/jobs', jobRoutes);
router.use('/catalog', catalogRoutes);
router.use('/learner', learnerRoutes);

export default router;