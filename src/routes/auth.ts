import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import passport from 'passport';
import { AuthController } from '../controllers/AuthController';
import { authenticateOnboardingToken, authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadAvatar } from '../middleware/upload';
import {
  createLearnerSchema,
  loginSchema,
  onboardingSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  oauthLoginSchema,
  updateNotificationSettingsSchema,
  updateTwoFactorSettingsSchema,
  verifyTwoFactorSchema,
  refreshTokenSchema,
  logoutSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailOtpSchema,
  resendOtpSchema,
} from '../services/UserService';
import { GoogleOAuthProfilePayload } from '../config/passport';

const router = Router();
const prisma = new PrismaClient();
const controller = new AuthController(prisma);

/**
 * POST /auth/signup
 * Create new learner with email/password
 */
router.post(
  '/signup',
  validate({ body: createLearnerSchema }),
  (req, res, next) => controller.signup(req, res, next),
);

/**
 * POST /auth/register
 * Alias for signup endpoint
 */
router.post(
  '/register',
  validate({ body: createLearnerSchema }),
  (req, res, next) => controller.signup(req, res, next),
);

/**
 * POST /auth/login
 * Login with email and password
 */
router.post(
  '/login',
  validate({ body: loginSchema }),
  (req, res, next) => controller.login(req, res, next),
);

/**
 * POST /auth/oauth
 * OAuth login
 */
router.post(
  '/oauth',
  validate({ body: oauthLoginSchema }),
  (req, res, next) => controller.oauthLogin(req, res, next),
);

/**
 * GET /auth/google
 * Start Google OAuth flow
 */
router.get(
  '/google',
  passport.authenticate('google', {
    session: false,
    scope: ['profile', 'email'],
  }),
);

/**
 * GET /auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (error: unknown, user: unknown) => {
    if (error) {
      next(error);
      return;
    }

    if (!user) {
      next(new Error('Google authentication failed'));
      return;
    }

    controller.googleCallback(req, res, next, user as GoogleOAuthProfilePayload);
  })(req, res, next);
});

/**
 * POST /auth/refresh
 * Refresh access token with refresh token
 */
router.post(
  '/refresh',
  validate({ body: refreshTokenSchema }),
  (req, res, next) => controller.refreshToken(req, res, next),
);

/**
 * POST /auth/logout
 * Stateless logout endpoint
 */
router.post(
  '/logout',
  validate({ body: logoutSchema }),
  (req, res, next) => controller.logout(req, res, next),
);

/**
 * POST /auth/forgot-password
 * Send password reset OTP
 */
router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema }),
  (req, res, next) => controller.forgotPassword(req, res, next),
);

/**
 * POST /auth/reset-password
 * Reset password using OTP
 */
router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  (req, res, next) => controller.resetPassword(req, res, next),
);

/**
 * GET /auth/onboarding-options
 * Get active professions and languages for onboarding forms
 */
router.get(
  '/onboarding-options',
  (req, res, next) => controller.getOnboardingOptions(req, res, next),
);

/**
 * GET /auth/onboarding/languages
 * Get active onboarding language options
 */
router.get(
  '/onboarding/languages',
  (req, res, next) => controller.getOnboardingLanguages(req, res, next),
);

/**
 * GET /auth/onboarding/professions
 * Get active onboarding profession options
 */
router.get(
  '/onboarding/professions',
  (req, res, next) => controller.getOnboardingProfessions(req, res, next),
);

/**
 * GET /auth/me
 * Get current learner profile
 */
router.get(
  '/me',
  authenticateToken,
  (req, res, next) => controller.getProfile(req, res, next),
);

/**
 * PUT /auth/profile
 * Update learner profile
 */
router.put(
  '/profile',
  authenticateToken,
  validate({ body: updateProfileSchema }),
  (req, res, next) => controller.updateProfile(req, res, next),
);

/**
 * GET /auth/preferences
 * Get learner preferences
 */
router.get(
  '/preferences',
  authenticateToken,
  (req, res, next) => controller.getPreferences(req, res, next),
);

/**
 * PUT /auth/preferences
 * Update learner preferences
 */
router.put(
  '/preferences',
  authenticateToken,
  validate({ body: updatePreferencesSchema }),
  (req, res, next) => controller.updatePreferences(req, res, next),
);

/**
 * GET /auth/settings
 * Get learner account settings
 */
router.get(
  '/settings',
  authenticateToken,
  (req, res, next) => controller.getSettings(req, res, next),
);

/**
 * PATCH /auth/settings/notifications
 * Update notification settings
 */
router.patch(
  '/settings/notifications',
  authenticateToken,
  validate({ body: updateNotificationSettingsSchema }),
  (req, res, next) => controller.updateNotificationSettings(req, res, next),
);

/**
 * PATCH /auth/settings/2fa
 * Update 2FA setting
 */
router.patch(
  '/settings/2fa',
  authenticateToken,
  validate({ body: updateTwoFactorSettingsSchema }),
  (req, res, next) => controller.updateTwoFactorSettings(req, res, next),
);

/**
 * POST /auth/2fa/setup
 * Start 2FA setup
 */
router.post(
  '/2fa/setup',
  authenticateToken,
  (req, res, next) => controller.startTwoFactorSetup(req, res, next),
);

/**
 * POST /auth/2fa/verify
 * Verify 2FA setup code
 */
router.post(
  '/2fa/verify',
  authenticateToken,
  validate({ body: verifyTwoFactorSchema }),
  (req, res, next) => controller.verifyTwoFactorSetup(req, res, next),
);

/**
 * DELETE /auth/2fa
 * Disable 2FA
 */
router.delete(
  '/2fa',
  authenticateToken,
  (req, res, next) => controller.disableTwoFactor(req, res, next),
);

/**
 * POST /auth/change-password
 * Change learner account password
 */
router.post(
  '/change-password',
  authenticateToken,
  validate({ body: changePasswordSchema }),
  (req, res, next) => controller.changePassword(req, res, next),
);

/**
 * POST /auth/verify-email
 * Verify email
 */
router.post(
  '/verify-email',
  validate({ body: verifyEmailOtpSchema }),
  (req, res, next) => controller.verifyEmailOtp(req, res, next),
);

/**
 * POST /auth/verify-email-otp
 * Verify email with OTP
 */
router.post(
  '/verify-email-otp',
  validate({ body: verifyEmailOtpSchema }),
  (req, res, next) => controller.verifyEmailOtp(req, res, next),
);

/**
 * POST /auth/resend-otp
 * Resend email verification OTP
 */
router.post(
  '/resend-otp',
  validate({ body: resendOtpSchema }),
  (req, res, next) => controller.resendOtp(req, res, next),
);

/**
 * POST /auth/onboarding
 * Complete onboarding for verified learner and auto-login
 */
router.post(
  '/onboarding',
  authenticateOnboardingToken,
  uploadAvatar.single('avatar'),
  validate({ body: onboardingSchema }),
  (req, res, next) => controller.completeOnboarding(req, res, next),
);

/**
 * POST /auth/avatar
 * Upload/replace learner avatar
 */
router.post(
  '/avatar',
  authenticateToken,
  uploadAvatar.single('avatar'),
  (req, res, next) => controller.uploadAvatar(req, res, next),
);

/**
 * DELETE /auth/account
 * Delete learner account
 */
router.delete(
  '/account',
  authenticateToken,
  (req, res, next) => controller.deleteAccount(req, res, next),
);

export default router;
