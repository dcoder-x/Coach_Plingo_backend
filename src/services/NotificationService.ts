import { Prisma, PrismaClient } from '@prisma/client';
import { SimpleLogger } from '../utils/Logger';

export type NotificationType =
  | 'MILESTONE_COMPLETED'
  | 'WORD_MASTERED'
  | 'LESSON_AVAILABLE'
  | 'DAILY_REMINDER'
  | 'ACHIEVEMENT'
  | 'ERROR';

interface NotificationRecord {
  id: string;
  learnerId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  learnerId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResponse {
  id: string;
  learnerId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('NotificationService');
  }

  /**
   * Create a notification for a learner
   */
  async createNotification(input: CreateNotificationInput): Promise<NotificationResponse> {
    const notification = await this.prisma.notification.create({
      data: {
        learnerId: input.learnerId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    this.logger.info(
      `Created notification for learner ${input.learnerId}: ${input.type}`,
    );

    return this.formatNotification(notification);
  }

  /**
   * Get unread notifications for a learner
   */
  async getUnreadNotifications(learnerId: string): Promise<NotificationResponse[]> {
    const notifications = await this.prisma.notification.findMany({
      where: {
        learnerId,
        read: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    return notifications.map((n: NotificationRecord) => this.formatNotification(n));
  }

  /**
   * Get all notifications for a learner (paginated)
   */
  async getNotifications(
    learnerId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ notifications: NotificationResponse[]; total: number }> {
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { learnerId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.notification.count({
        where: { learnerId },
      }),
    ]);

    return {
      notifications: notifications.map((n: NotificationRecord) => this.formatNotification(n)),
      total,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<NotificationResponse> {
    const notification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return this.formatNotification(notification);
  }

  /**
   * Mark all notifications as read for a learner
   */
  async markAllAsRead(learnerId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { learnerId, read: false },
      data: { read: true },
    });

    this.logger.info(`Marked ${result.count} notifications as read for learner ${learnerId}`);

    return result.count;
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    this.logger.debug(`Deleted notification: ${notificationId}`);
  }

  /**
   * Get unread count for a learner
   */
  async getUnreadCount(learnerId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { learnerId, read: false },
    });
  }

  /**
   * Send milestone completion notification
   */
  async notifyMilestoneCompleted(
    learnerId: string,
    milestoneName: string,
    language: string,
  ): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'MILESTONE_COMPLETED',
      title: 'Milestone Completed!',
      message: `You've completed the ${milestoneName} milestone for ${language}!`,
      metadata: { milestoneName, language },
    });
  }

  /**
   * Send word mastered notification
   */
  async notifyWordMastered(
    learnerId: string,
    word: string,
  ): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'WORD_MASTERED',
      title: 'Word Mastered!',
      message: `Great job! You've mastered the word "${word}"!`,
      metadata: { word },
    });
  }

  /**
   * Send lesson available notification
   */
  async notifyLessonAvailable(learnerId: string): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'LESSON_AVAILABLE',
      title: 'New Lesson Available',
      message: "You're ready for your next lesson. Let's continue learning!",
    });
  }

  /**
   * Send error notification
   */
  async notifyError(
    learnerId: string,
    errorMessage: string,
  ): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'ERROR',
      title: 'Something went wrong',
      message: errorMessage,
    });
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private formatNotification(notification: NotificationRecord): NotificationResponse {
    return {
      id: notification.id,
      learnerId: notification.learnerId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      metadata: notification.metadata as Record<string, unknown> | undefined,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
