import axios from 'axios';
import { Prisma, PrismaClient } from '@prisma/client';
import { SimpleLogger } from '../utils/Logger';
import { BadgeDefinition } from './BadgeService';
import { EmailService } from './EmailService';

export type NotificationType =
  | 'MILESTONE_COMPLETED'
  | 'WORD_MASTERED'
  | 'LESSON_AVAILABLE'
  | 'DAILY_REMINDER'
  | 'ACHIEVEMENT'
  | 'BADGE_EARNED'
  | 'STREAK_MILESTONE'
  | 'PATH_COMPLETED'
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

export interface NotificationPreferences {
  inApp: boolean;
  email: boolean;
}

// ─── Expo push ────────────────────────────────────────────────────────────────

interface ExpoPushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Which notification types send email (push always fires when inApp enabled)
const EMAIL_TYPES = new Set<NotificationType>([
  'BADGE_EARNED',
  'STREAK_MILESTONE',
  'MILESTONE_COMPLETED',
  'PATH_COMPLETED',
  'DAILY_REMINDER',
]);

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;
  private emailService: EmailService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('NotificationService');
    this.emailService = new EmailService();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core CRUD
  // ──────────────────────────────────────────────────────────────────────────

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

    this.logger.info(`Created notification for learner ${input.learnerId}: ${input.type}`);

    // Non-blocking delivery — never throws
    this.dispatchChannels(input).catch(
      (err: Error) => this.logger.error(`Notification dispatch failed: ${err.message}`),
    );

    return this.formatNotification(notification);
  }

  async getUnreadNotifications(learnerId: string): Promise<NotificationResponse[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { learnerId, read: false },
      orderBy: { createdAt: 'desc' },
    });
    return notifications.map((n: NotificationRecord) => this.formatNotification(n));
  }

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
      this.prisma.notification.count({ where: { learnerId } }),
    ]);

    return {
      notifications: notifications.map((n: NotificationRecord) => this.formatNotification(n)),
      total,
    };
  }

  async markAsRead(notificationId: string): Promise<NotificationResponse> {
    const notification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
    return this.formatNotification(notification);
  }

  async markAllAsRead(learnerId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { learnerId, read: false },
      data: { read: true },
    });
    this.logger.info(`Marked ${result.count} notifications as read for learner ${learnerId}`);
    return result.count;
  }

  async deleteNotification(notificationId: string): Promise<void> {
    await this.prisma.notification.delete({ where: { id: notificationId } });
    this.logger.debug(`Deleted notification: ${notificationId}`);
  }

  async getUnreadCount(learnerId: string): Promise<number> {
    return this.prisma.notification.count({ where: { learnerId, read: false } });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Preferences
  // ──────────────────────────────────────────────────────────────────────────

  async getPreferences(learnerId: string): Promise<NotificationPreferences> {
    const learner = await this.prisma.learner.findUniqueOrThrow({
      where: { id: learnerId },
      select: { notificationInAppEnabled: true, notificationEmailEnabled: true },
    });
    return { inApp: learner.notificationInAppEnabled, email: learner.notificationEmailEnabled };
  }

  async updatePreferences(
    learnerId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const data: Record<string, boolean> = {};
    if (prefs.inApp !== undefined) data.notificationInAppEnabled = prefs.inApp;
    if (prefs.email !== undefined) data.notificationEmailEnabled = prefs.email;

    const learner = await this.prisma.learner.update({
      where: { id: learnerId },
      data,
      select: { notificationInAppEnabled: true, notificationEmailEnabled: true },
    });
    this.logger.info(`Updated notification prefs for learner ${learnerId}`);
    return { inApp: learner.notificationInAppEnabled, email: learner.notificationEmailEnabled };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Push token management
  // ──────────────────────────────────────────────────────────────────────────

  async registerPushToken(learnerId: string, pushToken: string): Promise<void> {
    await this.prisma.learner.update({
      where: { id: learnerId },
      data: { pushToken },
    });
    this.logger.info(`Registered push token for learner ${learnerId}`);
  }

  async removePushToken(learnerId: string): Promise<void> {
    await this.prisma.learner.update({
      where: { id: learnerId },
      data: { pushToken: null },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Domain helpers
  // ──────────────────────────────────────────────────────────────────────────

  async notifyMilestoneCompleted(
    learnerId: string,
    milestoneName: string,
    language: string,
  ): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'MILESTONE_COMPLETED',
      title: 'Milestone Completed! 🎯',
      message: `You've completed the ${milestoneName} milestone for ${language}!`,
      metadata: { milestoneName, language },
    });
  }

  async notifyWordMastered(learnerId: string, word: string): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'WORD_MASTERED',
      title: 'Word Mastered!',
      message: `You've mastered the word "${word}"!`,
      metadata: { word },
    });
  }

  async notifyLessonAvailable(learnerId: string): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'LESSON_AVAILABLE',
      title: 'New Lesson Available',
      message: "You're ready for your next lesson. Let's continue learning!",
    });
  }

  async notifyBadgeEarned(
    learnerId: string,
    badge: BadgeDefinition,
  ): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'BADGE_EARNED',
      title: `Badge Unlocked: ${badge.name}`,
      message: badge.description,
      metadata: {
        badgeKey: badge.key,
        badgeName: badge.name,
        badgeTier: badge.tier,
        badgeCategory: badge.category,
        iconName: badge.iconName,
        xpReward: badge.xpReward,
      },
    });
  }

  async notifyStreakMilestone(learnerId: string, streakDays: number): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'STREAK_MILESTONE',
      title: `${streakDays}-Day Streak! 🔥`,
      message: `Incredible! You've been learning for ${streakDays} days in a row. Keep it up!`,
      metadata: { streakDays },
    });
  }

  async notifyPathCompleted(learnerId: string, pathName: string): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'PATH_COMPLETED',
      title: 'Learning Path Completed! 🏆',
      message: `Congratulations! You've completed ${pathName}. Start a new path to keep growing.`,
      metadata: { pathName },
    });
  }

  async notifyError(learnerId: string, errorMessage: string): Promise<NotificationResponse> {
    return this.createNotification({
      learnerId,
      type: 'ERROR',
      title: 'Something went wrong',
      message: errorMessage,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Delivery
  // ──────────────────────────────────────────────────────────────────────────

  private async dispatchChannels(input: CreateNotificationInput): Promise<void> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: input.learnerId },
      select: {
        email: true,
        fullName: true,
        pushToken: true,
        notificationInAppEnabled: true,
        notificationEmailEnabled: true,
      },
    });

    if (!learner) return;

    const pushPromise = learner.notificationInAppEnabled && learner.pushToken
      ? this.sendPush(learner.pushToken, input.title, input.message, input.metadata)
      : Promise.resolve();

    const emailPromise = learner.notificationEmailEnabled && EMAIL_TYPES.has(input.type)
      ? this.sendEmailForType(learner.email, learner.fullName ?? 'Learner', input)
      : Promise.resolve();

    await Promise.all([
      pushPromise.catch((e: Error) => this.logger.error(`Push failed: ${e.message}`)),
      emailPromise.catch((e: Error) => this.logger.error(`Email failed: ${e.message}`)),
    ]);
  }

  private async sendPush(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      this.logger.debug('Skipping push for non-Expo token');
      return;
    }

    const payload: ExpoPushPayload = { to: token, title, body, sound: 'default', data: data ?? {} };
    await axios.post(EXPO_PUSH_URL, payload, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 5000,
    });
    this.logger.debug(`Push sent to token ${token.slice(0, 30)}…`);
  }

  private async sendEmailForType(
    email: string,
    firstName: string,
    input: CreateNotificationInput,
  ): Promise<void> {
    const meta = input.metadata ?? {};

    switch (input.type) {
      case 'BADGE_EARNED':
        await this.emailService.sendBadgeEarned(
          email,
          String(meta.badgeName ?? input.title),
          String(meta.badgeTier ?? 'BRONZE'),
          String(meta.description ?? input.message),
          Number(meta.xpReward ?? 0),
        );
        break;

      case 'STREAK_MILESTONE':
        await this.emailService.sendStreakMilestone(email, Number(meta.streakDays ?? 0));
        break;

      case 'MILESTONE_COMPLETED':
        await this.emailService.sendMilestoneCompleted(
          email,
          String(meta.milestoneName ?? input.title),
          String(meta.language ?? ''),
        );
        break;

      case 'PATH_COMPLETED':
        await this.emailService.sendPathCompleted(email, String(meta.pathName ?? input.title));
        break;

      case 'DAILY_REMINDER':
        await this.emailService.sendDailyReminder(email, firstName);
        break;

      default:
        break;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

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
