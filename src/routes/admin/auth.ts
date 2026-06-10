import { Router } from 'express';
import { AdminAuthController } from '../../controllers/AdminAuthController';

const router = Router();
const controller = new AdminAuthController();

router.post('/login', (req, res) => controller.login(req, res));

export default router;
