import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { SimpleLogger } from '../utils/Logger';
import { z } from 'zod';

const logger = new SimpleLogger('ErrorHandler');

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error(`${req.method} ${req.path}`, error);

  // Handle AppError
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      details: error.details,
      statusCode: error.statusCode,
    });
    return;
  }

  // Handle Prisma errors
  if (error.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      const field = prismaError.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        error: `${field} already exists`,
        details: { [field]: [`This ${field} is already in use`] },
        statusCode: 409,
      });
      return;
    }
    if (prismaError.code === 'P2025') {
      // Record not found
      res.status(404).json({
        success: false,
        error: 'Record not found',
        statusCode: 404,
      });
      return;
    }
    if (prismaError.code === 'P2003') {
      // Foreign key constraint violation
      res.status(400).json({
        success: false,
        error: 'Invalid reference to related record',
        statusCode: 400,
      });
      return;
    }
  }

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: error.flatten().fieldErrors,
      statusCode: 400,
    });
    return;
  }

  // Handle generic errors
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    statusCode: 500,
  });
};
