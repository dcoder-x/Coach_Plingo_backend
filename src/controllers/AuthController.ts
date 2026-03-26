import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  UserService,
  CreateLearnerInput,
  LoginInput,
  OnboardingInput,
  UpdatePreferencesInput,
  UpdateNotificationSettingsInput,
  UpdateTwoFactorSettingsInput,
  VerifyTwoFactorInput,
  RefreshTokenInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailOtpInput,
  OAuthLoginInput,
} from '../services/UserService';
import { SimpleLogger } from '../utils/Logger';
import { AppError } from '../utils/AppError';
import { GoogleOAuthProfilePayload } from '../config/passport';

const logger = new SimpleLogger('AuthController');

export class AuthController {
  private userService: UserService;

  constructor(prisma: PrismaClient) {
    this.userService = new UserService(prisma);
  }

  /**
   * POST /auth/signup
   * Create new learner with email/password
   */
  async signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: CreateLearnerInput = req.body;
      const result = await this.userService.createLearner(input);

      logger.info(`Signup successful: ${result.learner.id}`);

      res.status(201).json({
        success: true,
        data: {
          learner: result.learner,
          nextStep: result.nextStep,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login
   * Login with email and password
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: LoginInput = req.body;
      const result = await this.userService.loginWithEmail(input);

      logger.info(`Login successful: ${result.learner.id}`);

      res.json({
        success: true,
        data: {
          learner: result.learner,
          nextStep: result.nextStep,
          ...(result.token ? { token: result.token } : {}),
          ...(result.onboardingToken ? { onboardingToken: result.onboardingToken } : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/oauth
   * Login or create learner via OAuth
   */
  async oauthLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.userService.loginWithOAuth(req.body);

      logger.info(`OAuth login successful: ${result.learner.id} (newUser: ${result.isNewUser})`);

      res.json({
        success: true,
        data: {
          learner: result.learner,
          nextStep: result.nextStep,
          ...(result.token ? { token: result.token } : {}),
          ...(result.onboardingToken ? { onboardingToken: result.onboardingToken } : {}),
          isNewUser: result.isNewUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/onboarding-options
   * Get onboarding dropdown options (languages and professions)
   */
  async getOnboardingOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options = await this.userService.getOnboardingOptions();

      res.json({
        success: true,
        data: options,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/onboarding/languages
   * Get active languages for onboarding forms
   */
  async getOnboardingLanguages(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const languages = await this.userService.getOnboardingLanguages();

      res.json({
        success: true,
        data: { languages },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/onboarding/professions
   * Get active professions for onboarding forms
   */
  async getOnboardingProfessions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const professions = await this.userService.getOnboardingProfessions();

      res.json({
        success: true,
        data: { professions },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/me
   * Get current learner profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const learner = await this.userService.getLearner(learnerId);

      res.json({
        success: true,
        data: { learner },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /auth/profile
   * Update learner profile
   */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const learner = await this.userService.updateProfile(learnerId, req.body);

      logger.info(`Profile updated: ${learnerId}`);

      res.json({
        success: true,
        data: { learner },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/preferences
   * Get learner preferences
   */
  async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const preferences = await this.userService.getPreferences(learnerId);

      res.json({
        success: true,
        data: { preferences },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /auth/preferences
   * Update learner preferences
   */
  async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const input: UpdatePreferencesInput = req.body;
      const preferences = await this.userService.updatePreferences(learnerId, input);

      res.json({
        success: true,
        data: { preferences },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/settings
   * Get learner account settings
   */
  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const settings = await this.userService.getSettings(learnerId);

      res.json({
        success: true,
        data: { settings },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /auth/settings/notifications
   * Update learner notification settings
   */
  async updateNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const input: UpdateNotificationSettingsInput = req.body;
      const notifications = await this.userService.updateNotificationSettings(learnerId, input);

      res.json({
        success: true,
        data: {
          message: 'Notification settings updated successfully',
          notifications,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /auth/settings/2fa
   * Update learner two-factor authentication setting
   */
  async updateTwoFactorSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const input: UpdateTwoFactorSettingsInput = req.body;
      const security = await this.userService.updateTwoFactorSettings(learnerId, input);

      res.json({
        success: true,
        data: {
          message: input.enabled
            ? '2FA setup code sent. Verify to complete setup'
            : '2FA disabled successfully',
          security,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/2fa/setup
   * Start 2FA setup and send verification code
   */
  async startTwoFactorSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const result = await this.userService.startTwoFactorSetup(learnerId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/2fa/verify
   * Verify 2FA setup code and enable 2FA
   */
  async verifyTwoFactorSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const input: VerifyTwoFactorInput = req.body;
      const security = await this.userService.verifyTwoFactorSetup(learnerId, input);

      res.json({
        success: true,
        data: {
          message: '2FA enabled successfully',
          security,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /auth/2fa
   * Disable 2FA for current learner
   */
  async disableTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const security = await this.userService.disableTwoFactor(learnerId);

      res.json({
        success: true,
        data: {
          message: '2FA disabled successfully',
          security,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/verify-email
   * Verify email (stub)
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const learner = await this.userService.verifyEmail(learnerId);

      res.json({
        success: true,
        data: { learner },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/verify-email-otp
   * Verify email using OTP
   */
  async verifyEmailOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: VerifyEmailOtpInput = req.body;
      const result = await this.userService.verifyEmailWithOtp(input);

      res.json({
        success: true,
        data: {
          learner: result.learner,
          nextStep: result.nextStep,
          ...(result.token ? { token: result.token } : {}),
          ...(result.onboardingToken ? { onboardingToken: result.onboardingToken } : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/resend-otp
   * Resend email verification OTP
   */
  async resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const email = req.body?.email;
      await this.userService.resendEmailOtp(email);

      res.json({
        success: true,
        data: { message: 'Verification OTP sent successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/onboarding
   * Complete learner onboarding and auto-login
   */
  async completeOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const input: OnboardingInput = req.body;
      const result = await this.userService.completeOnboarding(
        learnerId,
        input,
        req.file
          ? {
              buffer: req.file.buffer,
              mimetype: req.file.mimetype,
            }
          : undefined,
      );

      res.json({
        success: true,
        data: {
          learner: result.learner,
          token: result.token,
          nextStep: 'AUTHENTICATED',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/forgot-password
   * Send password reset OTP to email
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: ForgotPasswordInput = req.body;
      await this.userService.forgotPassword(input);

      res.json({
        success: true,
        data: { message: 'Password reset OTP sent successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password
   * Reset password using OTP
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: ResetPasswordInput = req.body;
      await this.userService.resetPasswordWithOtp(input);

      res.json({
        success: true,
        data: { message: 'Password reset successful' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /auth/account
   * Delete learner account
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      await this.userService.deleteLearner(learnerId);

      logger.info(`Account deleted: ${learnerId}`);

      res.json({
        success: true,
        data: { message: 'Account deleted successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh
   * Exchange refresh token for a new token pair
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: RefreshTokenInput = req.body;
      const token = await this.userService.refreshTokens(input);

      res.json({
        success: true,
        data: { token },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout
   * Stateless logout endpoint for clients
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body?.refreshToken;
      await this.userService.logout(refreshToken);

      res.json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/change-password
   * Change password for authenticated learner
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);
      const input: ChangePasswordInput = req.body;
      await this.userService.changePassword(learnerId, input);

      res.json({
        success: true,
        data: { message: 'Password changed successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/avatar
   * Upload or replace learner avatar
   */
  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const learnerId = this.requireLearnerId(req);

      if (!req.file) {
        throw AppError.badRequest('Avatar file is required');
      }

      const learner = await this.userService.uploadAvatar(learnerId, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
      });

      res.json({
        success: true,
        data: { learner },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/google/callback
   * Handle Google OAuth callback and issue app JWT tokens
   */
  async googleCallback(
    _req: Request,
    res: Response,
    next: NextFunction,
    profile: GoogleOAuthProfilePayload,
  ): Promise<void> {
    try {
      const oauthInput: OAuthLoginInput = {
        ...profile,
      };

      const result = await this.userService.loginWithOAuth(oauthInput);

      res.json({
        success: true,
        data: {
          learner: result.learner,
          nextStep: result.nextStep,
          ...(result.token ? { token: result.token } : {}),
          ...(result.onboardingToken ? { onboardingToken: result.onboardingToken } : {}),
          isNewUser: result.isNewUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  private requireLearnerId(req: Request): string {
    if (!req.learnerId) {
      throw AppError.unauthorized('Not authenticated');
    }

    return req.learnerId;
  }
}
