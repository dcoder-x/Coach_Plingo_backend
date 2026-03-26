import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';

export const createLanguageSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  isActive: z.boolean().optional().default(true),
});

export const updateLanguageSchema = z
  .object({
    code: z.string().trim().min(2).max(20).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field is required',
  });

export const createProfessionSchema = z.object({
  slug: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  isActive: z.boolean().optional().default(true),
});

export const updateProfessionSchema = z
  .object({
    slug: z.string().trim().min(2).max(120).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field is required',
  });

export const includeInactiveQuerySchema = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
});

export type CreateLanguageInput = z.infer<typeof createLanguageSchema>;
export type UpdateLanguageInput = z.infer<typeof updateLanguageSchema>;
export type CreateProfessionInput = z.infer<typeof createProfessionSchema>;
export type UpdateProfessionInput = z.infer<typeof updateProfessionSchema>;

export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  async listLanguages(includeInactive = false) {
    return this.prisma.languageOption.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createLanguage(input: CreateLanguageInput) {
    return this.prisma.languageOption.create({
      data: {
        code: input.code,
        name: input.name,
        isActive: input.isActive,
      },
    });
  }

  async updateLanguage(id: string, input: UpdateLanguageInput) {
    const existing = await this.prisma.languageOption.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Language not found');
    }

    return this.prisma.languageOption.update({
      where: { id },
      data: input,
    });
  }

  async deleteLanguage(id: string) {
    const existing = await this.prisma.languageOption.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Language not found');
    }

    await this.prisma.languageOption.delete({ where: { id } });
  }

  async listProfessions(includeInactive = false) {
    return this.prisma.professionOption.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createProfession(input: CreateProfessionInput) {
    return this.prisma.professionOption.create({
      data: {
        slug: input.slug,
        name: input.name,
        isActive: input.isActive,
      },
    });
  }

  async updateProfession(id: string, input: UpdateProfessionInput) {
    const existing = await this.prisma.professionOption.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Profession not found');
    }

    return this.prisma.professionOption.update({
      where: { id },
      data: input,
    });
  }

  async deleteProfession(id: string) {
    const existing = await this.prisma.professionOption.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Profession not found');
    }

    await this.prisma.professionOption.delete({ where: { id } });
  }
}
