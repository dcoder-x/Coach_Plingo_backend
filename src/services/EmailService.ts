import nodemailer, { Transporter } from 'nodemailer';
import { SimpleLogger } from '../utils/Logger';

// ─── Shared HTML wrapper ──────────────────────────────────────────────────────

function htmlWrap(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0D1A13;padding:24px 32px;">
              <span style="font-size:20px;font-weight:700;color:#7FC1B5;letter-spacing:-0.5px;">Coach Plingo</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you have an account on Coach Plingo.<br/>
                To manage your notification preferences, open the app and go to Account &rsaquo; Notifications.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Template builders ────────────────────────────────────────────────────────

function badgeEarnedHtml(badgeName: string, badgeTier: string, description: string, xpReward: number): string {
  const tierColors: Record<string, string> = {
    BRONZE: '#cd7f32',
    SILVER: '#9ca3af',
    GOLD: '#eab308',
    PLATINUM: '#22c55e',
  };
  const color = tierColors[badgeTier] ?? '#7FC1B5';

  return htmlWrap('Badge Unlocked — Coach Plingo', `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Badge Unlocked! 🏅</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">You just earned a new achievement.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.8px;color:${color};text-transform:uppercase;">${badgeTier}</p>
          <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#111827;">${badgeName}</p>
          <p style="margin:0;font-size:14px;color:#6b7280;">${description}</p>
          ${xpReward > 0 ? `<p style="margin:10px 0 0;font-size:13px;font-weight:600;color:#eab308;">+${xpReward} XP bonus</p>` : ''}
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:14px;color:#374151;">Keep learning to unlock more badges!</p>
  `);
}

function streakMilestoneHtml(streakDays: number): string {
  return htmlWrap(`${streakDays}-Day Streak — Coach Plingo`, `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">${streakDays}-Day Streak! 🔥</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">You've been learning every day for ${streakDays} days in a row.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #fed7aa;">
      <tr>
        <td align="center">
          <p style="margin:0;font-size:48px;line-height:1;">🔥</p>
          <p style="margin:8px 0 0;font-size:28px;font-weight:700;color:#ea580c;">${streakDays} Days</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9a3412;">Current Streak</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:14px;color:#374151;">Don't break it — open the app and complete today's lesson to keep your streak alive.</p>
  `);
}

function milestoneCompletedHtml(milestoneName: string, language: string): string {
  return htmlWrap('Milestone Completed — Coach Plingo', `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Milestone Completed! 🎯</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">You've reached a major checkpoint in your learning journey.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.8px;color:#16a34a;text-transform:uppercase;">${language}</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#111827;">${milestoneName}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:14px;color:#374151;">Your next milestone is waiting — keep the momentum going!</p>
  `);
}

function pathCompletedHtml(pathName: string): string {
  return htmlWrap('Learning Path Completed — Coach Plingo', `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You Did It! 🎉</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">You've completed your entire learning path.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #fde68a;">
      <tr>
        <td align="center">
          <p style="margin:0;font-size:48px;line-height:1;">🏆</p>
          <p style="margin:12px 0 4px;font-size:18px;font-weight:700;color:#111827;">${pathName}</p>
          <p style="margin:0;font-size:13px;color:#92400e;">Learning path complete</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:14px;color:#374151;">This is a huge achievement. Ready for the next challenge? Start a new path in the app.</p>
  `);
}

function dailyReminderHtml(firstName: string): string {
  return htmlWrap('Your Daily Reminder — Coach Plingo', `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Time to practice, ${firstName}! 📚</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Just a friendly nudge — you haven't done today's lesson yet.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #bae6fd;">
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:#0369a1;">Even 5 minutes of daily practice compounds into fluency. Your streak is counting on you.</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:14px;color:#374151;">Open the app and complete today's lesson to keep your progress going.</p>
  `);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class EmailService {
  private readonly logger: SimpleLogger;
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;

  constructor() {
    this.logger = new SimpleLogger('EmailService');
    this.fromAddress = process.env.EMAIL_FROM || 'no-reply@coachplingo.com';
    this.transporter = this.createTransporter();
  }

  // ── Auth emails ────────────────────────────────────────────────────────────

  async sendEmailVerificationOTP(email: string, otp: string): Promise<void> {
    await this.sendMail(
      { to: email, subject: 'CoachPlingo Email Verification Code', text: `Your verification code is ${otp}. It expires in 10 minutes.` },
      otp, email, 'email verification',
    );
  }

  async sendPasswordResetOTP(email: string, otp: string): Promise<void> {
    await this.sendMail(
      { to: email, subject: 'CoachPlingo Password Reset Code', text: `Your password reset code is ${otp}. It expires in 10 minutes.` },
      otp, email, 'password reset',
    );
  }

  // ── Notification emails ────────────────────────────────────────────────────

  async sendBadgeEarned(
    email: string,
    badgeName: string,
    badgeTier: string,
    description: string,
    xpReward: number,
  ): Promise<void> {
    await this.sendHtml(
      email,
      `You earned a badge: ${badgeName} — Coach Plingo`,
      `You just unlocked the ${badgeName} badge (${badgeTier}).`,
      badgeEarnedHtml(badgeName, badgeTier, description, xpReward),
      'badge earned',
    );
  }

  async sendStreakMilestone(email: string, streakDays: number): Promise<void> {
    await this.sendHtml(
      email,
      `${streakDays}-Day Streak — Coach Plingo`,
      `You've maintained a ${streakDays}-day learning streak!`,
      streakMilestoneHtml(streakDays),
      'streak milestone',
    );
  }

  async sendMilestoneCompleted(email: string, milestoneName: string, language: string): Promise<void> {
    await this.sendHtml(
      email,
      `Milestone Completed: ${milestoneName} — Coach Plingo`,
      `You've completed the ${milestoneName} milestone for ${language}!`,
      milestoneCompletedHtml(milestoneName, language),
      'milestone completed',
    );
  }

  async sendPathCompleted(email: string, pathName: string): Promise<void> {
    await this.sendHtml(
      email,
      `Learning Path Completed — Coach Plingo`,
      `Congratulations! You've completed ${pathName}.`,
      pathCompletedHtml(pathName),
      'path completed',
    );
  }

  async sendDailyReminder(email: string, firstName: string): Promise<void> {
    await this.sendHtml(
      email,
      `Time to practice, ${firstName}! — Coach Plingo`,
      `Don't forget your daily lesson today!`,
      dailyReminderHtml(firstName),
      'daily reminder',
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private createTransporter(): Transporter | null {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secureFromEnv = process.env.SMTP_SECURE;
    const secure =
      typeof secureFromEnv === 'string'
        ? secureFromEnv.toLowerCase() === 'true'
        : port === 465;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured — notification emails will be logged in dev mode.');
      return null;
    }

    return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }

  private async sendHtml(
    to: string,
    subject: string,
    text: string,
    html: string,
    purpose: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.info(`[DEV] Email (${purpose}) to ${to}: ${subject}`);
      return;
    }
    await this.transporter.sendMail({ from: this.fromAddress, to, subject, text, html });
    this.logger.info(`Email sent (${purpose}) to ${to}`);
  }

  private async sendMail(
    message: { to: string; subject: string; text: string },
    otp: string,
    email: string,
    purpose: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.info(`[DEV] OTP (${purpose}) for ${email}: ${otp}`);
      return;
    }
    await this.transporter.sendMail({ from: this.fromAddress, ...message });
    this.logger.info(`Email sent (${purpose}) to ${email}`);
  }
}
