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
  id: z.string().min(1, 'Invalid notification ID'),
});

const pushTokenSchema = z.object({
  pushToken: z.string().min(1, 'Push token required'),
});

const preferencesSchema = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
}).refine((d) => d.inApp !== undefined || d.email !== undefined, {
  message: 'At least one preference field (inApp or email) must be provided',
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

/**
 * POST /notifications/push-token
 * Register or update the learner's Expo push token
 */
router.post(
  '/push-token',
  authenticateToken,
  validate({ body: pushTokenSchema }),
  (req, res, next) => controller.registerPushToken(req, res, next),
);

/**
 * DELETE /notifications/push-token
 * Remove the learner's push token (on logout)
 */
router.delete(
  '/push-token',
  authenticateToken,
  (req, res, next) => controller.removePushToken(req, res, next),
);

/**
 * GET /notifications/preferences
 * Get the learner's notification preferences (inApp, email)
 */
router.get(
  '/preferences',
  authenticateToken,
  (req, res, next) => controller.getPreferences(req, res, next),
);

/**
 * PUT /notifications/preferences
 * Update the learner's notification preferences
 */
router.put(
  '/preferences',
  authenticateToken,
  validate({ body: preferencesSchema }),
  (req, res, next) => controller.updatePreferences(req, res, next),
);

export default router;
