import { PrismaClient } from '@prisma/client';
import { BadgeService } from './BadgeService';

export interface LearnerStreakResponse {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakAtRisk: boolean;
}

export class StreakService {
  private readonly badgeService: BadgeService;

  constructor(private readonly prisma: PrismaClient) {
    this.badgeService = new BadgeService(prisma);
  }

  async updateStreak(learnerId: string, completionDate: Date): Promise<void> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: { location: true },
    });

    const timezone = this.normalizeTimezone(learner?.location);
    const today = this.toLocalDateString(completionDate, timezone);

    const streak = await this.prisma.learnerStreak.findUnique({
      where: { learnerId },
    });

    if (!streak) {
      await this.prisma.learnerStreak.create({
        data: {
          learnerId,
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: new Date(today),
          streakAtRisk: false,
        },
      });
      // First day counts as streak 1 — check badges
      this.badgeService
        .checkAndAwardBadges({ type: 'STREAK_UPDATED', learnerId, currentStreak: 1 })
        .catch(() => undefined);
      return;
    }

    const lastActivityDate = streak.lastActivityDate
      ? this.toLocalDateString(streak.lastActivityDate, timezone)
      : null;

    if (lastActivityDate === today) {
      return;
    }

    const yesterday = this.subtractDays(today, 1);

    if (lastActivityDate === yesterday) {
      const nextStreak = streak.currentStreak + 1;
      await this.prisma.learnerStreak.update({
        where: { learnerId },
        data: {
          currentStreak: nextStreak,
          longestStreak: Math.max(nextStreak, streak.longestStreak),
          lastActivityDate: new Date(today),
          streakAtRisk: false,
        },
      });
      this.badgeService
        .checkAndAwardBadges({ type: 'STREAK_UPDATED', learnerId, currentStreak: nextStreak })
        .catch(() => undefined);
      return;
    }

    // Streak broken — reset to 1
    await this.prisma.learnerStreak.update({
      where: { learnerId },
      data: {
        currentStreak: 1,
        lastActivityDate: new Date(today),
        streakAtRisk: false,
      },
    });
  }

  async getLearnerStreak(learnerId: string): Promise<LearnerStreakResponse> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: { location: true },
    });

    const timezone = this.normalizeTimezone(learner?.location);

    const streak = await this.prisma.learnerStreak.findUnique({
      where: { learnerId },
    });

    if (!streak) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        streakAtRisk: false,
      };
    }

    const lastActivityDate = streak.lastActivityDate
      ? this.toLocalDateString(streak.lastActivityDate, timezone)
      : null;

    const today = this.toLocalDateString(new Date(), timezone);
    const yesterday = this.subtractDays(today, 1);

    // If the learner missed at least one full day, the streak is reset.
    if (lastActivityDate && streak.currentStreak > 0 && lastActivityDate !== today && lastActivityDate !== yesterday) {
      await this.prisma.learnerStreak.update({
        where: { learnerId },
        data: {
          currentStreak: 0,
          streakAtRisk: false,
        },
      });

      return {
        currentStreak: 0,
        longestStreak: streak.longestStreak,
        lastActivityDate,
        streakAtRisk: false,
      };
    }

    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActivityDate,
      streakAtRisk: this.computeStreakAtRisk(lastActivityDate, streak.currentStreak, timezone),
    };
  }

  private computeStreakAtRisk(
    lastActivityDate: string | null,
    currentStreak: number,
    timezone: string,
  ): boolean {
    if (!lastActivityDate || currentStreak === 0) {
      return false;
    }

    const today = this.toLocalDateString(new Date(), timezone);
    const yesterday = this.subtractDays(today, 1);

    return lastActivityDate === yesterday;
  }

  private toLocalDateString(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return formatter.format(date);
  }

  private subtractDays(dateString: string, days: number): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - days);

    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  private normalizeTimezone(input?: string | null): string {
    if (!input) {
      return 'UTC';
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: input });
      return input;
    } catch {
      return 'UTC';
    }
  }
}
