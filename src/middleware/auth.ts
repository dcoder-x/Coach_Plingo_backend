import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { JwtPayload } from '../types';

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

export const authenticateOnboardingToken = authenticateToken;
