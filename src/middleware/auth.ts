import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { JwtPayload } from '../types';

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      learnerId?: string;
    }
  }
}

export const authenticateToken = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw AppError.unauthorized('Missing authentication token');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw AppError.internal('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    if (decoded.tokenType && decoded.tokenType !== 'access') {
      throw AppError.unauthorized('Invalid token type');
    }

    req.user = decoded;
    req.learnerId = decoded.learnerId;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(AppError.unauthorized('Invalid or expired token'));
    } else {
      next(error);
    }
  }
};

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
        req.user = decoded;
        req.learnerId = decoded.learnerId;
      }
    }

    next();
  } catch (error) {
    // Silently fail - continue without auth
    next();
  }
};

export const authenticateOnboardingToken = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw AppError.unauthorized('Missing onboarding token');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw AppError.internal('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    if (decoded.tokenType !== 'onboarding') {
      throw AppError.unauthorized('Invalid onboarding token');
    }

    const learner = await prisma.learner.findUnique({
      where: { id: decoded.learnerId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        profileComplete: true,
      },
    });

    if (!learner) {
      throw AppError.notFound('Learner not found');
    }

    if (learner.profileComplete) {
      throw AppError.unauthorized('Onboarding token has already been used');
    }

    if (!learner.emailVerified) {
      throw AppError.forbidden('Email must be verified before onboarding');
    }

    if (decoded.email !== learner.email) {
      throw AppError.unauthorized('Onboarding token does not match learner');
    }

    req.user = decoded;
    req.learnerId = decoded.learnerId;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(AppError.unauthorized('Invalid or expired onboarding token'));
    } else {
      next(error);
    }
  }
};
