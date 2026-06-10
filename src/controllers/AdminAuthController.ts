import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export class AdminAuthController {
  login(req: Request, res: Response): void {
    const { secret } = req.body as { secret?: string };

    const adminSecret = process.env.ADMIN_SECRET;
    const jwtSecret = process.env.ADMIN_JWT_SECRET;

    if (!adminSecret || !jwtSecret) {
      throw AppError.internal('Admin auth is not configured');
    }

    if (!secret || secret !== adminSecret) {
      throw AppError.unauthorized('Invalid admin secret');
    }

    const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '12h' });

    res.json({ success: true, token });
  }
}
