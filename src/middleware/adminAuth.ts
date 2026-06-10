import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export interface AdminJwtPayload {
  role: 'admin';
  iat: number;
  exp: number;
}

declare module 'express' {
  interface Request {
    admin?: AdminJwtPayload;
  }
}

export const authenticateAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw AppError.unauthorized('Missing admin token');
    }

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      throw AppError.internal('ADMIN_JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, secret) as AdminJwtPayload;
    if (decoded.role !== 'admin') {
      throw AppError.forbidden('Not an admin token');
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(AppError.unauthorized('Invalid or expired admin token'));
    } else {
      next(error);
    }
  }
};
