import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { CatalogController } from '../controllers/CatalogController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createLanguageSchema,
  updateLanguageSchema,
  createProfessionSchema,
  updateProfessionSchema,
  includeInactiveQuerySchema,
} from '../services/CatalogService';

const router = Router();
const prisma = new PrismaClient();
const controller = new CatalogController(prisma);

const idParamSchema = z.object({
  id: z.string().min(1, 'Invalid id'),
});

router.get('/languages', validate({ query: includeInactiveQuerySchema }), (req, res, next) =>
  controller.listLanguages(req, res, next),
);
router.post('/languages', authenticateToken, validate({ body: createLanguageSchema }), (req, res, next) =>
  controller.createLanguage(req, res, next),
);
router.put(
  '/languages/:id',
  authenticateToken,
  validate({ params: idParamSchema, body: updateLanguageSchema }),
  (req, res, next) => controller.updateLanguage(req, res, next),
);
router.delete('/languages/:id', authenticateToken, validate({ params: idParamSchema }), (req, res, next) =>
  controller.deleteLanguage(req, res, next),
);

router.get('/professions', validate({ query: includeInactiveQuerySchema }), (req, res, next) =>
  controller.listProfessions(req, res, next),
);
router.post(
  '/professions',
  authenticateToken,
  validate({ body: createProfessionSchema }),
  (req, res, next) => controller.createProfession(req, res, next),
);
router.put(
  '/professions/:id',
  authenticateToken,
  validate({ params: idParamSchema, body: updateProfessionSchema }),
  (req, res, next) => controller.updateProfession(req, res, next),
);
router.delete('/professions/:id', authenticateToken, validate({ params: idParamSchema }), (req, res, next) =>
  controller.deleteProfession(req, res, next),
);

export default router;
