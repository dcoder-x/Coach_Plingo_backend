import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { NotificationController } from '../controllers/NotificationController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();
const controller = new NotificationController(prisma);

// Param validators
const notificationIdSchema = z.object({
  id: z.string().uuid('Invalid notification ID'),
});

/**
 * GET /notifications
 * Get all notifications with pagination
 */
router.get(
  '/',
  authenticateToken,
  (req, res, next) => controller.getNotifications(req, res, next),
);

/**
 * GET /notifications/unread
 * Get unread notifications
 */
router.get(
  '/unread',
  authenticateToken,
  (req, res, next) => controller.getUnreadNotifications(req, res, next),
);

/**
 * GET /notifications/unread-count
 * Get unread count
 */
router.get(
  '/unread-count',
  authenticateToken,
  (req, res, next) => controller.getUnreadCount(req, res, next),
);

/**
 * PUT /notifications/:id/read
 * Mark as read
 */
router.put(
  '/:id/read',
  authenticateToken,
  validate({ params: notificationIdSchema }),
  (req, res, next) => controller.markAsRead(req, res, next),
);

/**
 * PUT /notifications/read-all
 * Mark all as read
 */
router.put(
  '/read-all',
  authenticateToken,
  (req, res, next) => controller.markAllAsRead(req, res, next),
);

/**
 * DELETE /notifications/:id
 * Delete notification
 */
router.delete(
  '/:id',
  authenticateToken,
  validate({ params: notificationIdSchema }),
  (req, res, next) => controller.deleteNotification(req, res, next),
);

export default router;
