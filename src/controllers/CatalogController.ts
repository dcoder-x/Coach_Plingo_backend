import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  CatalogService,
  CreateLanguageInput,
  UpdateLanguageInput,
  CreateProfessionInput,
  UpdateProfessionInput,
} from '../services/CatalogService';

export class CatalogController {
  private readonly service: CatalogService;

  constructor(prisma: PrismaClient) {
    this.service = new CatalogService(prisma);
  }

  async listLanguages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const languages = await this.service.listLanguages(includeInactive);
      res.json({ success: true, data: { languages } });
    } catch (error) {
      next(error);
    }
  }

  async createLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: CreateLanguageInput = req.body;
      const language = await this.service.createLanguage(input);
      res.status(201).json({ success: true, data: { language } });
    } catch (error) {
      next(error);
    }
  }

  async updateLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const language = await this.service.updateLanguage(req.params.id, req.body as UpdateLanguageInput);
      res.json({ success: true, data: { language } });
    } catch (error) {
      next(error);
    }
  }

  async deleteLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteLanguage(req.params.id);
      res.json({ success: true, data: { message: 'Language deleted successfully' } });
    } catch (error) {
      next(error);
    }
  }

  async listProfessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const professions = await this.service.listProfessions(includeInactive);
      res.json({ success: true, data: { professions } });
    } catch (error) {
      next(error);
    }
  }

  async createProfession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: CreateProfessionInput = req.body;
      const profession = await this.service.createProfession(input);
      res.status(201).json({ success: true, data: { profession } });
    } catch (error) {
      next(error);
    }
  }

  async updateProfession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profession = await this.service.updateProfession(req.params.id, req.body as UpdateProfessionInput);
      res.json({ success: true, data: { profession } });
    } catch (error) {
      next(error);
    }
  }

  async deleteProfession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteProfession(req.params.id);
      res.json({ success: true, data: { message: 'Profession deleted successfully' } });
    } catch (error) {
      next(error);
    }
  }
}
