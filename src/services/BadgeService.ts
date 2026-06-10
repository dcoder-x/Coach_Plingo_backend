import { PrismaClient } from '@prisma/client';
import { SimpleLogger } from '../utils/Logger';
import { NotificationService } from './NotificationService';

// ============================================================================
// Badge catalog — single source of truth for all badge definitions.
// Earned state is stored in LearnerBadge rows; these definitions are
// referenced by key from both backend and frontend.
// ============================================================================

export type BadgeTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type BadgeCategory = 'STREAK' | 'MASTERY' | 'LESSON' | 'MILESTONE' | 'SCORE' | 'XP';

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  iconName: string; // Lucide icon name used on the frontend
  xpReward: number; // Bonus XP awarded when badge is earned (0 = no bonus)
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  // ── Streak ────────────────────────────────────────────────────────────────
  { key: 'streak_3',   name: 'On a Roll',       description: 'Maintain a 3-day learning streak',   category: 'STREAK',    tier: 'BRONZE',   iconName: 'flame',        xpReward: 10  },
  { key: 'streak_7',   name: 'Week Warrior',    description: 'Maintain a 7-day learning streak',   category: 'STREAK',    tier: 'SILVER',   iconName: 'flame',        xpReward: 25  },
  { key: 'streak_30',  name: 'Monthly Master',  description: 'Maintain a 30-day learning streak',  category: 'STREAK',    tier: 'GOLD',     iconName: 'flame',        xpReward: 100 },
  { key: 'streak_100', name: 'Centurion',       description: 'Maintain a 100-day learning streak', category: 'STREAK',    tier: 'PLATINUM', iconName: 'flame',        xpReward: 500 },

  // ── Word mastery ──────────────────────────────────────────────────────────
  { key: 'first_word',  name: 'First Step',              description: 'Master your first word',  category: 'MASTERY', tier: 'BRONZE',   iconName: 'star',         xpReward: 5   },
  { key: 'words_10',    name: 'Word Builder',            description: 'Master 10 words',         category: 'MASTERY', tier: 'BRONZE',   iconName: 'book-open',    xpReward: 20  },
  { key: 'words_50',    name: 'Vocabulary Enthusiast',   description: 'Master 50 words',         category: 'MASTERY', tier: 'SILVER',   iconName: 'book-open',    xpReward: 75  },
  { key: 'words_100',   name: 'Wordsmith',               description: 'Master 100 words',        category: 'MASTERY', tier: 'GOLD',     iconName: 'award',        xpReward: 200 },
  { key: 'words_500',   name: 'Lexicon Master',          description: 'Master 500 words',        category: 'MASTERY', tier: 'PLATINUM', iconName: 'award',        xpReward: 1000 },

  // ── Lessons ───────────────────────────────────────────────────────────────
  { key: 'first_lesson',  name: 'Lesson One',           description: 'Complete your first lesson',  category: 'LESSON', tier: 'BRONZE',   iconName: 'check-circle', xpReward: 10  },
  { key: 'lessons_5',     name: 'Getting Traction',     description: 'Complete 5 lessons',          category: 'LESSON', tier: 'BRONZE',   iconName: 'check-circle', xpReward: 30  },
  { key: 'lessons_10',    name: 'Dedicated Learner',    description: 'Complete 10 lessons',         category: 'LESSON', tier: 'SILVER',   iconName: 'trending-up',  xpReward: 60  },
  { key: 'lessons_25',    name: 'Language Enthusiast',  description: 'Complete 25 lessons',         category: 'LESSON', tier: 'GOLD',     iconName: 'trending-up',  xpReward: 150 },
  { key: 'lessons_50',    name: 'Learning Champion',    description: 'Complete 50 lessons',         category: 'LESSON', tier: 'PLATINUM', iconName: 'trophy',       xpReward: 400 },

  // ── Learning-path milestones ──────────────────────────────────────────────
  { key: 'milestone_vocabulary',    name: 'Sprint Complete',    description: 'Complete the Vocabulary Sprint milestone',  category: 'MILESTONE', tier: 'SILVER',   iconName: 'zap',  xpReward: 50  },
  { key: 'milestone_comprehension', name: 'Deep Reader',        description: 'Complete the Comprehension milestone',      category: 'MILESTONE', tier: 'GOLD',     iconName: 'book', xpReward: 100 },
  { key: 'milestone_pronunciation', name: 'Pronunciation Pro',  description: 'Complete Pronunciation Mastery',            category: 'MILESTONE', tier: 'PLATINUM', iconName: 'mic',  xpReward: 200 },

  // ── Score ─────────────────────────────────────────────────────────────────
  { key: 'perfect_score', name: 'Perfectionist', description: 'Achieve a perfect mastery score (10/10) on a word', category: 'SCORE', tier: 'SILVER', iconName: 'target', xpReward: 30 },

  // ── XP ────────────────────────────────────────────────────────────────────
  { key: 'xp_100',  name: 'Century Club',  description: 'Earn 100 XP on a learning path',  category: 'XP', tier: 'BRONZE', iconName: 'zap', xpReward: 0 },
  { key: 'xp_500',  name: 'Power Learner', description: 'Earn 500 XP on a learning path',  category: 'XP', tier: 'SILVER', iconName: 'zap', xpReward: 0 },
  { key: 'xp_1000', name: 'XP Legend',     description: 'Earn 1000 XP on a learning path', category: 'XP', tier: 'GOLD',   iconName: 'zap', xpReward: 0 },
];

const BADGE_MAP = new Map<string, BadgeDefinition>(BADGE_CATALOG.map((b) => [b.key, b]));

// ============================================================================
// Event types
// ============================================================================

export type BadgeEvent =
  | { type: 'WORD_MASTERED';       learnerId: string; totalMastered: number; masteryScore?: number }
  | { type: 'LESSON_COMPLETED';    learnerId: string; totalLessonsCompleted: number }
  | { type: 'STREAK_UPDATED';      learnerId: string; currentStreak: number }
  | { type: 'MILESTONE_COMPLETED'; learnerId: string; milestoneType: 'VOCABULARY_SPRINT' | 'COMPREHENSION' | 'PRONUNCIATION_MASTERY' }
  | { type: 'XP_EARNED';           learnerId: string; totalXp: number };

// ============================================================================
// Response shapes
// ============================================================================

export interface LearnerBadgeResponse {
  id: string;
  learnerId: string;
  badgeKey: string;
  earnedAt: Date;
  badge: BadgeDefinition;
}

export interface BadgeWithStatus extends BadgeDefinition {
  earned: boolean;
  earnedAt: Date | null;
}

// ============================================================================
// Service
// ============================================================================

export class BadgeService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;
  private notificationService: NotificationService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('BadgeService');
    this.notificationService = new NotificationService(prisma);
  }

  /**
   * Check whether any new badges are unlocked by this event and award them.
   * Returns the definitions of every badge newly earned.
   * Safe to call fire-and-forget — all errors are caught internally.
   */
  async checkAndAwardBadges(event: BadgeEvent): Promise<BadgeDefinition[]> {
    try {
      const { learnerId } = event;

      // Load already-earned badge keys for deduplication
      const earned = await this.prisma.learnerBadge.findMany({
        where: { learnerId },
        select: { badgeKey: true },
      });
      const earnedKeys = new Set(earned.map((b) => b.badgeKey));

      const eligible = this.getEligibleBadges(event, earnedKeys);
      if (eligible.length === 0) return [];

      // Award each eligible badge and send a notification
      const awarded: BadgeDefinition[] = [];
      for (const badge of eligible) {
        await this.prisma.learnerBadge.create({
          data: { learnerId, badgeKey: badge.key },
        });
        awarded.push(badge);

        await this.notificationService
          .notifyBadgeEarned(learnerId, badge)
          .catch((err: Error) =>
            this.logger.error(`Badge notification failed (${badge.key}): ${err.message}`),
          );

        this.logger.info(`Awarded badge "${badge.key}" to learner ${learnerId}`);
      }

      return awarded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`checkAndAwardBadges failed: ${msg}`);
      return [];
    }
  }

  /**
   * Get all badge definitions enriched with the learner's earned status.
   * Returns the full catalog with earned/not-earned + earnedAt timestamps.
   */
  async getLearnerBadges(learnerId: string): Promise<BadgeWithStatus[]> {
    const earnedRows = await this.prisma.learnerBadge.findMany({
      where: { learnerId },
      select: { badgeKey: true, earnedAt: true },
    });

    const earnedMap = new Map(earnedRows.map((r) => [r.badgeKey, r.earnedAt]));

    return BADGE_CATALOG
      .map((def) => ({
        ...def,
        earned: earnedMap.has(def.key),
        earnedAt: earnedMap.get(def.key) ?? null,
      }))
      .sort((a, b) => {
        if (a.earned === b.earned) {
          // Among earned: most recently earned first
          if (a.earned) return (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0);
          return 0;
        }
        return a.earned ? -1 : 1;
      });
  }

  /**
   * Get only the badges the learner has earned, most recent first.
   */
  async getEarnedBadges(learnerId: string): Promise<LearnerBadgeResponse[]> {
    const rows = await this.prisma.learnerBadge.findMany({
      where: { learnerId },
      orderBy: { earnedAt: 'desc' },
    });

    return rows.flatMap((row) => {
      const badge = BADGE_MAP.get(row.badgeKey);
      if (!badge) return [];
      return [{ id: row.id, learnerId: row.learnerId, badgeKey: row.badgeKey, earnedAt: row.earnedAt, badge }];
    });
  }

  /**
   * Get badges earned since `since` (defaults to 5 minutes ago).
   * Used by the frontend to detect newly unlocked badges after an action.
   */
  async getRecentlyEarned(learnerId: string, since?: Date): Promise<LearnerBadgeResponse[]> {
    const cutoff = since ?? new Date(Date.now() - 5 * 60 * 1000);

    const rows = await this.prisma.learnerBadge.findMany({
      where: { learnerId, earnedAt: { gte: cutoff } },
      orderBy: { earnedAt: 'desc' },
    });

    return rows.flatMap((row) => {
      const badge = BADGE_MAP.get(row.badgeKey);
      if (!badge) return [];
      return [{ id: row.id, learnerId: row.learnerId, badgeKey: row.badgeKey, earnedAt: row.earnedAt, badge }];
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private getEligibleBadges(event: BadgeEvent, earnedKeys: Set<string>): BadgeDefinition[] {
    const pick = (key: string) => {
      if (earnedKeys.has(key)) return null;
      return BADGE_MAP.get(key) ?? null;
    };

    const eligible: BadgeDefinition[] = [];

    switch (event.type) {
      case 'WORD_MASTERED': {
        const { totalMastered, masteryScore } = event;

        for (const [key, threshold] of [
          ['first_word',  1],
          ['words_10',    10],
          ['words_50',    50],
          ['words_100',   100],
          ['words_500',   500],
        ] as [string, number][]) {
          if (totalMastered >= threshold) {
            const b = pick(key);
            if (b) eligible.push(b);
          }
        }

        if (masteryScore !== undefined && masteryScore >= 10) {
          const b = pick('perfect_score');
          if (b) eligible.push(b);
        }
        break;
      }

      case 'LESSON_COMPLETED': {
        const { totalLessonsCompleted } = event;

        for (const [key, threshold] of [
          ['first_lesson', 1],
          ['lessons_5',    5],
          ['lessons_10',   10],
          ['lessons_25',   25],
          ['lessons_50',   50],
        ] as [string, number][]) {
          if (totalLessonsCompleted >= threshold) {
            const b = pick(key);
            if (b) eligible.push(b);
          }
        }
        break;
      }

      case 'STREAK_UPDATED': {
        const { currentStreak } = event;

        for (const [key, threshold] of [
          ['streak_3',   3],
          ['streak_7',   7],
          ['streak_30',  30],
          ['streak_100', 100],
        ] as [string, number][]) {
          if (currentStreak >= threshold) {
            const b = pick(key);
            if (b) eligible.push(b);
          }
        }
        break;
      }

      case 'MILESTONE_COMPLETED': {
        const milestoneMap: Record<string, string> = {
          VOCABULARY_SPRINT:    'milestone_vocabulary',
          COMPREHENSION:        'milestone_comprehension',
          PRONUNCIATION_MASTERY:'milestone_pronunciation',
        };
        const key = milestoneMap[event.milestoneType];
        if (key) {
          const b = pick(key);
          if (b) eligible.push(b);
        }
        break;
      }

      case 'XP_EARNED': {
        const { totalXp } = event;

        for (const [key, threshold] of [
          ['xp_100',  100],
          ['xp_500',  500],
          ['xp_1000', 1000],
        ] as [string, number][]) {
          if (totalXp >= threshold) {
            const b = pick(key);
            if (b) eligible.push(b);
          }
        }
        break;
      }
    }

    return eligible;
  }
}
