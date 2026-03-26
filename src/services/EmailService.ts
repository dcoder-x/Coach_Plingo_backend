import nodemailer, { Transporter } from 'nodemailer';
import { SimpleLogger } from '../utils/Logger';

export class EmailService {
  private readonly logger: SimpleLogger;
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;

  constructor() {
    this.logger = new SimpleLogger('EmailService');
    this.fromAddress = process.env.EMAIL_FROM || 'no-reply@coachplingo.app';
    this.transporter = this.createTransporter();
  }

  async sendEmailVerificationOTP(email: string, otp: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: 'CoachPlingo Email Verification Code',
      text: `Your CoachPlingo email verification code is ${otp}. It expires in 10 minutes.`,
    }, otp, email, 'email verification');
  }

  async sendPasswordResetOTP(email: string, otp: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: 'CoachPlingo Password Reset Code',
      text: `Your CoachPlingo password reset code is ${otp}. It expires in 10 minutes.`,
    }, otp, email, 'password reset');
  }

  private createTransporter(): Transporter | null {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured. OTP emails will be logged in development mode.');
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
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

    await this.transporter.sendMail({
      from: this.fromAddress,
      ...message,
    });
    this.logger.info(`Email sent (${purpose}) to ${email}`);
  }
}
