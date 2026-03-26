import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { formatZodErrors } from '../utils/validators';

export interface ValidatedRequest<T> extends Request {
  body: T;
  params: Record<string, string>;
  query: Record<string, string>;
}

type ValidationTarget = 'body' | 'query' | 'params';

export const validate = (schemas: Partial<Record<ValidationTarget, z.ZodSchema>>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          throw AppError.badRequest('Validation failed', formatZodErrors(parsed.error));
        }
        req.body = parsed.data;
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          throw AppError.badRequest('Query validation failed', formatZodErrors(parsed.error));
        }
        req.query = parsed.data as any;
      }

      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          throw AppError.badRequest('Params validation failed', formatZodErrors(parsed.error));
        }
        req.params = parsed.data as any;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
