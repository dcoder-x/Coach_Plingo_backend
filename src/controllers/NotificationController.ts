import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../services/NotificationService';
import { SimpleLogger } from '../utils/Logger';
import { AppError } from '../utils/AppError';

const logger = new SimpleLogger('NotificationController');

export class NotificationController {
  private notificationService: NotificationService;

  constructor(prisma: PrismaClient) {
    this.notificationService = new NotificationService(prisma);
  }

  /**
   * GET /notifications
   * Get all notifications for authenticated learner
   */
  async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await this.notificationService.getNotifications(req.learnerId, limit, offset);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications/unread
   * Get unread notifications only
   */
  async getUnreadNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const notifications = await this.notificationService.getUnreadNotifications(req.learnerId);
      const count = await this.notificationService.getUnreadCount(req.learnerId);

      res.json({
        success: true,
        data: { notifications, count },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications/unread-count
   * Get count of unread notifications
   */
  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const count = await this.notificationService.getUnreadCount(req.learnerId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /notifications/:id/read
   * Mark notification as read
   */
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const notification = await this.notificationService.markAsRead(id);

      logger.info(`Marked notification as read: ${id}`);

      res.json({
        success: true,
        data: { notification },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /notifications/read-all
   * Mark all notifications as read
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.learnerId) {
        throw AppError.unauthorized('Not authenticated');
      }

      const count = await this.notificationService.markAllAsRead(req.learnerId);

      logger.info(`Marked all notifications as read for learner ${req.learnerId}`);

      res.json({
        success: true,
        data: { markedCount: count },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /notifications/:id
   * Delete a notification
   */
  async deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      await this.notificationService.deleteNotification(id);

      logger.info(`Deleted notification: ${id}`);

      res.json({
        success: true,
        data: { message: 'Notification deleted' },
      });
    } catch (error) {
      next(error);
    }
  }
}
