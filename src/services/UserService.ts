import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';
import { JwtPayload } from '../types';
import { EmailService } from './EmailService';
import { CloudinaryService } from './CloudinaryService';

interface LearnerRecord {
  id: string;
  email: string;
  fullName: string;
  baseLanguage: string;
  profession: string;
  location: string | null;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  emailVerified: boolean;
  notificationInAppEnabled: boolean;
  notificationEmailEnabled: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod?: string | null;
  twoFactorCodeHash?: string | null;
  twoFactorCodeExpiry?: Date | null;
  emailOtp: string | null;
  emailOtpExpiry: Date | null;
  passwordResetOtp: string | null;
  passwordResetOtpExpiry: Date | null;
  profileComplete: boolean;
  passwordHash: string | null;
  oauthProvider?: string | null;
  oauthId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PENDING_BASE_LANGUAGE = 'PENDING_BASE_LANGUAGE';
const PENDING_PROFESSION = 'PENDING_PROFESSION';

export const createLearnerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must include uppercase, lowercase, and number'),
  fullName: z.string().trim().min(2, 'Full name is required').max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const onboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  baseLanguage: z.string().trim().min(2).max(60),
  profession: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).nullable().optional(),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    baseLanguage: z.string().trim().min(2).max(60).optional(),
    profession: z.string().trim().min(2).max(120).optional(),
    location: z.string().trim().max(120).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one profile field must be provided',
  });

export const updatePreferencesSchema = z
  .object({
    baseLanguage: z.string().trim().min(2).max(60).optional(),
    profession: z.string().trim().min(2).max(120).optional(),
    location: z.string().trim().max(120).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one preference field must be provided',
  });

export const updateNotificationSettingsSchema = z
  .object({
    inAppEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one notification setting must be provided',
  });

export const updateTwoFactorSettingsSchema = z.object({
  enabled: z.boolean(),
});

export const verifyTwoFactorSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

export const oauthLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  fullName: z.string().trim().min(2).max(120),
  oauthProvider: z.enum(['google', 'apple']),
  oauthId: z.string().trim().min(1),
});

export const verifyEmailSchema = z.object({
  learnerId: z.string().uuid('Invalid learner ID'),
  token: z.string().trim().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must not exceed 128 characters')
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'New password must include uppercase, lowercase, and number'),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

export const resendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must not exceed 128 characters')
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'New password must include uppercase, lowercase, and number'),
});

export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type OAuthLoginInput = z.infer<typeof oauthLoginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;
export type UpdateTwoFactorSettingsInput = z.infer<typeof updateTwoFactorSettingsSchema>;
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  refreshExpiresIn: string;
}

export type AuthNextStep = 'VERIFY_EMAIL' | 'COMPLETE_ONBOARDING' | 'AUTHENTICATED';

export interface AuthFlowResult {
  learner: LearnerResponse;
  nextStep: AuthNextStep;
  token?: AuthTokens;
  onboardingToken?: string;
}

export interface OAuthAuthFlowResult extends AuthFlowResult {
  isNewUser: boolean;
}

export interface LearnerResponse {
  id: string;
  email: string;
  fullName: string;
  baseLanguage: string;
  profession: string;
  location: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  profileComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingOptionsResponse {
  languages: {
    id: string;
    code: string;
    name: string;
  }[];
  professions: {
    id: string;
    slug: string;
    name: string;
  }[];
}

export interface UserPreferencesResponse {
  baseLanguage: string;
  profession: string;
  location: string | null;
}

export interface UserSettingsResponse {
  account: {
    email: string;
    emailVerified: boolean;
    oauthProvider: string | null;
    hasPassword: boolean;
  };
  notifications: {
    inAppEnabled: boolean;
    emailEnabled: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    twoFactorMethod: string | null;
  };
}

export class UserService {
  private prisma: PrismaClient;
  private logger: SimpleLogger;
  private emailService: EmailService;
  private cloudinaryService: CloudinaryService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger = new SimpleLogger('UserService');
    this.emailService = new EmailService();
    this.cloudinaryService = new CloudinaryService();
  }

  async createLearner(input: CreateLearnerInput): Promise<AuthFlowResult> {
    const existing = await this.prisma.learner.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppError.conflict('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, this.getSaltRounds());

    const learner = await this.prisma.learner.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName || 'New Learner',
        baseLanguage: PENDING_BASE_LANGUAGE,
        profession: PENDING_PROFESSION,
        emailVerified: false,
        profileComplete: false,
      },
    });

    await this.issueEmailVerificationOtp(learner.id, learner.email);
    this.logger.info(`Created learner pending verification: ${learner.id}`);

    return {
      learner: this.formatLearner(learner),
      nextStep: 'VERIFY_EMAIL',
    };
  }

  async loginWithEmail(input: LoginInput): Promise<AuthFlowResult> {
    const learner = await this.prisma.learner.findUnique({ where: { email: input.email } });

    if (!learner) {
      throw AppError.notFound('Learner with this email was not found');
    }

    if (!learner.passwordHash) {
      throw AppError.badRequest('Password login is not available for this account');
    }

    const passwordMatch = await bcrypt.compare(input.password, learner.passwordHash);
    if (!passwordMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    this.logger.info(`Email login validated credentials: ${learner.id}`);

    if (!learner.emailVerified) {
      await this.issueEmailVerificationOtp(learner.id, learner.email);
      return {
        learner: this.formatLearner(learner),
        nextStep: 'VERIFY_EMAIL',
      };
    }

    if (!learner.profileComplete) {
      return {
        learner: this.formatLearner(learner),
        nextStep: 'COMPLETE_ONBOARDING',
        onboardingToken: this.generateOnboardingToken(learner),
      };
    }

    return {
      learner: this.formatLearner(learner),
      nextStep: 'AUTHENTICATED',
      token: this.generateTokens(learner),
    };
  }

  async loginWithOAuth(input: OAuthLoginInput): Promise<OAuthAuthFlowResult> {
    let learner = await this.prisma.learner.findUnique({ where: { email: input.email } });
    let isNewUser = false;

    if (!learner) {
      learner = await this.prisma.learner.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          oauthProvider: input.oauthProvider,
          oauthId: input.oauthId,
          baseLanguage: PENDING_BASE_LANGUAGE,
          profession: PENDING_PROFESSION,
          emailVerified: true,
          profileComplete: false,
        },
      });
      isNewUser = true;
      this.logger.info(`Created OAuth learner: ${learner.id}`);
    } else if (!learner.oauthId) {
      learner = await this.prisma.learner.update({
        where: { id: learner.id },
        data: {
          oauthProvider: input.oauthProvider,
          oauthId: input.oauthId,
          emailVerified: true,
        },
      });
      this.logger.info(`Linked OAuth to learner: ${learner.id}`);
    } else if (learner.oauthId !== input.oauthId || learner.oauthProvider !== input.oauthProvider) {
      throw AppError.unauthorized('OAuth credentials do not match this account');
    }

    if (!learner.profileComplete) {
      return {
        learner: this.formatLearner(learner),
        nextStep: 'COMPLETE_ONBOARDING',
        onboardingToken: this.generateOnboardingToken(learner),
        isNewUser,
      };
    }

    return {
      learner: this.formatLearner(learner),
      nextStep: 'AUTHENTICATED',
      token: this.generateTokens(learner),
      isNewUser,
    };
  }

  async completeOnboarding(
    learnerId: string,
    input: OnboardingInput,
    file?: { buffer: Buffer; mimetype: string },
  ): Promise<{ learner: LearnerResponse; token: AuthTokens }> {
    const learner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    if (!learner.emailVerified) {
      throw AppError.forbidden('Email must be verified before onboarding');
    }

    await this.assertBaseLanguageExists(input.baseLanguage);
    await this.assertProfessionExists(input.profession);

    let avatarUrl: string | undefined;
    let avatarPublicId: string | undefined;

    if (file) {
      const uploaded = await this.cloudinaryService.uploadImage(file.buffer, file.mimetype, 'coach-plingo/avatars');
      avatarUrl = uploaded.secureUrl;
      avatarPublicId = uploaded.publicId;
    }

    const updatedLearner = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        fullName: input.fullName ?? learner.fullName,
        baseLanguage: input.baseLanguage,
        profession: input.profession,
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(avatarPublicId ? { avatarPublicId } : {}),
        profileComplete: true,
      },
    });

    if (learner.avatarPublicId && avatarPublicId && learner.avatarPublicId !== avatarPublicId) {
      try {
        await this.cloudinaryService.deleteImage(learner.avatarPublicId);
      } catch (error) {
        this.logger.warn(`Failed deleting old avatar during onboarding for learner: ${learnerId}`, error);
      }
    }

    return {
      learner: this.formatLearner(updatedLearner),
      token: this.generateTokens(updatedLearner),
    };
  }

  async getLearner(learnerId: string): Promise<LearnerResponse> {
    const learner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    return this.formatLearner(learner);
  }

  async updateProfile(learnerId: string, input: UpdateProfileInput): Promise<LearnerResponse> {
    if (input.baseLanguage) {
      await this.assertBaseLanguageExists(input.baseLanguage);
    }

    if (input.profession) {
      await this.assertProfessionExists(input.profession);
    }

    const learner = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        fullName: input.fullName,
        baseLanguage: input.baseLanguage,
        profession: input.profession,
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
    });

    this.logger.info(`Updated profile for learner: ${learnerId}`);
    return this.formatLearner(learner);
  }

  async verifyEmail(learnerId: string): Promise<LearnerResponse> {
    const learner = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        emailVerified: true,
        emailOtp: null,
        emailOtpExpiry: null,
      },
    });

    this.logger.info(`Email verified for learner: ${learnerId}`);
    return this.formatLearner(learner);
  }

  async resendVerificationEmail(email: string): Promise<void> {
    await this.resendEmailOtp(email);
  }

  async verifyEmailWithOtp(input: VerifyEmailOtpInput): Promise<AuthFlowResult> {
    const learner = await this.prisma.learner.findUnique({ where: { email: input.email } });

    if (!learner) {
      throw AppError.notFound('Learner with this email was not found');
    }

    if (!learner.emailOtp || !learner.emailOtpExpiry || learner.emailOtpExpiry.getTime() < Date.now()) {
      throw AppError.badRequest('Email verification OTP is invalid or expired');
    }

    if (learner.emailVerified) {
      throw AppError.conflict('Email is already verified');
    }

    const otpHash = this.hashOtp(input.otp);
    if (otpHash !== learner.emailOtp) {
      throw AppError.badRequest('Email verification OTP is invalid or expired');
    }

    const updatedLearner = await this.prisma.learner.update({
      where: { id: learner.id },
      data: {
        emailVerified: true,
        emailOtp: null,
        emailOtpExpiry: null,
      },
    });

    this.logger.info(`Email OTP verified for learner: ${updatedLearner.id}`);

    if (!updatedLearner.profileComplete) {
      return {
        learner: this.formatLearner(updatedLearner),
        nextStep: 'COMPLETE_ONBOARDING',
        onboardingToken: this.generateOnboardingToken(updatedLearner),
      };
    }

    return {
      learner: this.formatLearner(updatedLearner),
      nextStep: 'AUTHENTICATED',
      token: this.generateTokens(updatedLearner),
    };
  }

  async resendEmailOtp(email: string): Promise<void> {
    const learner = await this.prisma.learner.findUnique({ where: { email } });

    if (!learner) {
      throw AppError.notFound('Learner with this email was not found');
    }

    if (learner.emailVerified) {
      throw AppError.conflict('Email is already verified');
    }

    await this.issueEmailVerificationOtp(learner.id, learner.email);
    this.logger.info(`Resent email OTP for learner: ${learner.id}`);
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const learner = await this.prisma.learner.findUnique({ where: { email: input.email } });

    if (!learner) {
      throw AppError.notFound('Learner with this email was not found');
    }

    await this.issuePasswordResetOtp(learner.id, learner.email);
    this.logger.info(`Password reset OTP issued for learner: ${learner.id}`);
  }

  async resetPasswordWithOtp(input: ResetPasswordInput): Promise<void> {
    const learner = await this.prisma.learner.findUnique({ where: { email: input.email } });

    if (!learner) {
      throw AppError.notFound('Learner with this email was not found');
    }

    if (!learner.passwordResetOtp || !learner.passwordResetOtpExpiry || learner.passwordResetOtpExpiry.getTime() < Date.now()) {
      throw AppError.badRequest('Password reset OTP is invalid or expired');
    }

    const otpHash = this.hashOtp(input.otp);
    if (otpHash !== learner.passwordResetOtp) {
      throw AppError.badRequest('Password reset OTP is invalid or expired');
    }

    if (learner.passwordHash) {
      const isSamePassword = await bcrypt.compare(input.newPassword, learner.passwordHash);
      if (isSamePassword) {
        throw AppError.badRequest('New password must be different from current password');
      }
    }

    const nextPasswordHash = await bcrypt.hash(input.newPassword, this.getSaltRounds());

    await this.prisma.learner.update({
      where: { id: learner.id },
      data: {
        passwordHash: nextPasswordHash,
        passwordResetOtp: null,
        passwordResetOtpExpiry: null,
      },
    });

    this.logger.info(`Password reset completed for learner: ${learner.id}`);
  }

  async updateAvatar(learnerId: string, avatarUrl: string, avatarPublicId: string): Promise<LearnerResponse> {
    const existingLearner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!existingLearner) {
      throw AppError.notFound('Learner not found');
    }

    const updatedLearner = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        avatarUrl,
        avatarPublicId,
      },
    });

    if (existingLearner.avatarPublicId && existingLearner.avatarPublicId !== avatarPublicId) {
      try {
        await this.cloudinaryService.deleteImage(existingLearner.avatarPublicId);
      } catch (error) {
        this.logger.warn(`Failed to delete old avatar for learner: ${learnerId}`, error);
      }
    }

    this.logger.info(`Avatar updated for learner: ${learnerId}`);
    return this.formatLearner(updatedLearner);
  }

  async deleteLearner(learnerId: string): Promise<void> {
    const learner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    if (learner.avatarPublicId) {
      try {
        await this.cloudinaryService.deleteImage(learner.avatarPublicId);
      } catch (error) {
        this.logger.warn(`Failed deleting avatar for learner: ${learnerId}`, error);
      }
    }

    await this.prisma.learner.delete({ where: { id: learnerId } });
    this.logger.info(`Deleted learner: ${learnerId}`);
  }

  async refreshTokens(input: RefreshTokenInput): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(input.refreshToken);

    const learner = await this.prisma.learner.findUnique({ where: { id: payload.learnerId } });
    if (!learner) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    return this.generateTokens(learner);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      this.verifyRefreshToken(refreshToken);
    }

    this.logger.info('Logout completed');
  }

  async changePassword(learnerId: string, input: ChangePasswordInput): Promise<void> {
    const learner = await this.prisma.learner.findUnique({ where: { id: learnerId } });
    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    if (!learner.passwordHash) {
      throw AppError.badRequest('Password change is not available for OAuth-only accounts');
    }

    const isCurrentPasswordValid = await bcrypt.compare(input.currentPassword, learner.passwordHash);
    if (!isCurrentPasswordValid) {
      throw AppError.unauthorized('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(input.newPassword, learner.passwordHash);
    if (isSamePassword) {
      throw AppError.badRequest('New password must be different from current password');
    }

    const nextPasswordHash = await bcrypt.hash(input.newPassword, this.getSaltRounds());

    await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        passwordHash: nextPasswordHash,
      },
    });

    this.logger.info(`Password changed for learner: ${learnerId}`);
  }

  async uploadAvatar(learnerId: string, file: { buffer: Buffer; mimetype: string }): Promise<LearnerResponse> {
    const uploaded = await this.cloudinaryService.uploadImage(file.buffer, file.mimetype, 'coach-plingo/avatars');
    return this.updateAvatar(learnerId, uploaded.secureUrl, uploaded.publicId);
  }

  async getOnboardingOptions(): Promise<OnboardingOptionsResponse> {
    const [languages, professions] = await Promise.all([
      this.prisma.languageOption.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.professionOption.findMany({
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      languages,
      professions,
    };
  }

  async getOnboardingLanguages(): Promise<OnboardingOptionsResponse['languages']> {
    return this.prisma.languageOption.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getOnboardingProfessions(): Promise<OnboardingOptionsResponse['professions']> {
    return this.prisma.professionOption.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getPreferences(learnerId: string): Promise<UserPreferencesResponse> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: {
        baseLanguage: true,
        profession: true,
        location: true,
      },
    });

    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    return learner;
  }

  async updatePreferences(learnerId: string, input: UpdatePreferencesInput): Promise<UserPreferencesResponse> {
    if (input.baseLanguage) {
      await this.assertBaseLanguageExists(input.baseLanguage);
    }

    if (input.profession) {
      await this.assertProfessionExists(input.profession);
    }

    const learner = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        ...(input.baseLanguage !== undefined ? { baseLanguage: input.baseLanguage } : {}),
        ...(input.profession !== undefined ? { profession: input.profession } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
      select: {
        baseLanguage: true,
        profession: true,
        location: true,
      },
    });

    return learner;
  }

  async getSettings(learnerId: string): Promise<UserSettingsResponse> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: {
        email: true,
        emailVerified: true,
        oauthProvider: true,
        passwordHash: true,
        notificationInAppEnabled: true,
        notificationEmailEnabled: true,
        twoFactorEnabled: true,
        twoFactorMethod: true,
      },
    });

    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    return {
      account: {
        email: learner.email,
        emailVerified: learner.emailVerified,
        oauthProvider: learner.oauthProvider,
        hasPassword: Boolean(learner.passwordHash),
      },
      notifications: {
        inAppEnabled: learner.notificationInAppEnabled,
        emailEnabled: learner.notificationEmailEnabled,
      },
      security: {
        twoFactorEnabled: learner.twoFactorEnabled,
        twoFactorMethod: learner.twoFactorMethod,
      },
    };
  }

  async updateNotificationSettings(
    learnerId: string,
    input: UpdateNotificationSettingsInput,
  ): Promise<UserSettingsResponse['notifications']> {
    const learner = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        ...(input.inAppEnabled !== undefined
          ? { notificationInAppEnabled: input.inAppEnabled }
          : {}),
        ...(input.emailEnabled !== undefined
          ? { notificationEmailEnabled: input.emailEnabled }
          : {}),
      },
      select: {
        notificationInAppEnabled: true,
        notificationEmailEnabled: true,
      },
    });

    return {
      inAppEnabled: learner.notificationInAppEnabled,
      emailEnabled: learner.notificationEmailEnabled,
    };
  }

  async updateTwoFactorSettings(
    learnerId: string,
    input: UpdateTwoFactorSettingsInput,
  ): Promise<{ twoFactorEnabled: boolean; method: string | null; setupRequired?: boolean }> {
    if (input.enabled) {
      await this.startTwoFactorSetup(learnerId);
      return {
        twoFactorEnabled: false,
        method: null,
        setupRequired: true,
      };
    }

    const learner = await this.disableTwoFactor(learnerId);
    return {
      twoFactorEnabled: learner.twoFactorEnabled,
      method: learner.twoFactorMethod,
    };
  }

  async startTwoFactorSetup(learnerId: string): Promise<{ message: string; expiresInMinutes: number }> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    const otp = this.createNumericOtp();
    const codeHash = this.hashOtp(otp);
    const codeExpiry = this.getOtpExpiryDate();

    await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        twoFactorCodeHash: codeHash,
        twoFactorCodeExpiry: codeExpiry,
      },
    });

    await this.emailService.sendEmailVerificationOTP(learner.email, otp);

    return {
      message: '2FA verification code sent',
      expiresInMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
    };
  }

  async verifyTwoFactorSetup(learnerId: string, input: VerifyTwoFactorInput): Promise<{ twoFactorEnabled: boolean; method: string }> {
    const learner = await this.prisma.learner.findUnique({
      where: { id: learnerId },
      select: {
        id: true,
        twoFactorCodeHash: true,
        twoFactorCodeExpiry: true,
      },
    });

    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    if (!learner.twoFactorCodeHash || !learner.twoFactorCodeExpiry || learner.twoFactorCodeExpiry.getTime() < Date.now()) {
      throw AppError.badRequest('2FA verification code is invalid or expired');
    }

    const otpHash = this.hashOtp(input.otp);
    if (otpHash !== learner.twoFactorCodeHash) {
      throw AppError.badRequest('2FA verification code is invalid or expired');
    }

    const updated = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        twoFactorEnabled: true,
        twoFactorMethod: 'email',
        twoFactorCodeHash: null,
        twoFactorCodeExpiry: null,
      },
      select: {
        twoFactorEnabled: true,
        twoFactorMethod: true,
      },
    });

    return {
      twoFactorEnabled: updated.twoFactorEnabled,
      method: updated.twoFactorMethod || 'email',
    };
  }

  async disableTwoFactor(learnerId: string): Promise<{ twoFactorEnabled: boolean; twoFactorMethod: string | null }> {
    const updated = await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        twoFactorEnabled: false,
        twoFactorMethod: null,
        twoFactorCodeHash: null,
        twoFactorCodeExpiry: null,
      },
      select: {
        twoFactorEnabled: true,
        twoFactorMethod: true,
      },
    });

    return updated;
  }

  private generateTokens(learner: LearnerRecord): AuthTokens {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw AppError.internal('JWT_SECRET is not configured');
    }

    const expiresIn = process.env.JWT_EXPIRY || '7d';
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRY || '30d';

    const accessToken = jwt.sign(
      {
        learnerId: learner.id,
        email: learner.email,
        tokenType: 'access',
      },
      jwtSecret,
      { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] },
    );

    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || jwtSecret;
    const refreshToken = jwt.sign(
      {
        learnerId: learner.id,
        email: learner.email,
        tokenType: 'refresh',
      },
      refreshTokenSecret,
      { expiresIn: refreshExpiresIn as jwt.SignOptions['expiresIn'] },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      refreshExpiresIn,
    };
  }

  private generateOnboardingToken(learner: LearnerRecord): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw AppError.internal('JWT_SECRET is not configured');
    }

    const onboardingExpiresIn = process.env.ONBOARDING_TOKEN_EXPIRY || '30m';

    return jwt.sign(
      {
        learnerId: learner.id,
        email: learner.email,
        tokenType: 'onboarding',
      },
      jwtSecret,
      { expiresIn: onboardingExpiresIn as jwt.SignOptions['expiresIn'] },
    );
  }

  private verifyRefreshToken(refreshToken: string): JwtPayload {
    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    if (!refreshTokenSecret) {
      throw AppError.internal('JWT_SECRET is not configured');
    }

    try {
      const payload = jwt.verify(refreshToken, refreshTokenSecret) as JwtPayload;

      if (payload.tokenType !== 'refresh') {
        throw AppError.unauthorized('Invalid refresh token');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw AppError.unauthorized('Invalid or expired refresh token');
      }

      throw error;
    }
  }

  private getSaltRounds(): number {
    const configured = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
    if (!Number.isFinite(configured) || configured < 4 || configured > 31) {
      return 10;
    }

    return configured;
  }

  private createNumericOtp(length = 6): string {
    const max = Number('9'.repeat(length));
    const random = crypto.randomInt(0, max + 1);
    return random.toString().padStart(length, '0');
  }

  private hashOtp(otp: string): string {
    const otpSecret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'coach-plingo-otp-secret';
    return crypto.createHmac('sha256', otpSecret).update(otp).digest('hex');
  }

  private getOtpExpiryDate(): Date {
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES || 10);
    const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10;
    return new Date(Date.now() + ttl * 60_000);
  }

  private async issueEmailVerificationOtp(learnerId: string, email: string): Promise<void> {
    const otp = this.createNumericOtp();
    const emailOtp = this.hashOtp(otp);
    const emailOtpExpiry = this.getOtpExpiryDate();

    await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        emailOtp,
        emailOtpExpiry,
      },
    });

    await this.emailService.sendEmailVerificationOTP(email, otp);
  }

  private async issuePasswordResetOtp(learnerId: string, email: string): Promise<void> {
    const otp = this.createNumericOtp();
    const passwordResetOtp = this.hashOtp(otp);
    const passwordResetOtpExpiry = this.getOtpExpiryDate();

    await this.prisma.learner.update({
      where: { id: learnerId },
      data: {
        passwordResetOtp,
        passwordResetOtpExpiry,
      },
    });

    await this.emailService.sendPasswordResetOTP(email, otp);
  }

  private async assertBaseLanguageExists(baseLanguage: string): Promise<void> {
    const language = await this.prisma.languageOption.findUnique({
      where: { code: baseLanguage },
    });

    if (!language || !language.isActive) {
      throw AppError.badRequest('Selected base language is not supported');
    }
  }

  private async assertProfessionExists(profession: string): Promise<void> {
    const professionOption = await this.prisma.professionOption.findUnique({
      where: { slug: profession },
    });

    if (!professionOption || !professionOption.isActive) {
      throw AppError.badRequest('Selected profession is not supported');
    }
  }

  private formatLearner(learner: LearnerRecord): LearnerResponse {
    return {
      id: learner.id,
      email: learner.email,
      fullName: learner.fullName,
      baseLanguage: learner.baseLanguage,
      profession: learner.profession,
      location: learner.location,
      avatarUrl: learner.avatarUrl,
      emailVerified: learner.emailVerified,
      profileComplete: learner.profileComplete,
      createdAt: learner.createdAt,
      updatedAt: learner.updatedAt,
    };
  }
}
