import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Languages with real lesson content
  const activeLanguageCodes = ['en', 'es', 'de'];

  // Professions with real lesson content
  const activeProfessionSlugs = ['software_engineer', 'entrepreneur'];

  const [langActive, langInactive, profActive, profInactive] = await Promise.all([
    prisma.languageOption.updateMany({
      where: { code: { in: activeLanguageCodes } },
      data: { isActive: true },
    }),
    prisma.languageOption.updateMany({
      where: { code: { notIn: activeLanguageCodes } },
      data: { isActive: false },
    }),
    prisma.professionOption.updateMany({
      where: { slug: { in: activeProfessionSlugs } },
      data: { isActive: true },
    }),
    prisma.professionOption.updateMany({
      where: { slug: { notIn: activeProfessionSlugs } },
      data: { isActive: false },
    }),
  ]);

  console.log(`Languages  — activated: ${langActive.count}, deactivated: ${langInactive.count}`);
  console.log(`Professions — activated: ${profActive.count}, deactivated: ${profInactive.count}`);

  // Print final state for confirmation
  const [languages, professions] = await Promise.all([
    prisma.languageOption.findMany({ orderBy: { name: 'asc' }, select: { code: true, name: true, isActive: true } }),
    prisma.professionOption.findMany({ orderBy: { name: 'asc' }, select: { slug: true, name: true, isActive: true } }),
  ]);

  console.log('\nLanguages:');
  languages.forEach(l => console.log(`  [${l.isActive ? 'ACTIVE' : 'inactive'}] ${l.code} — ${l.name}`));

  console.log('\nProfessions:');
  professions.forEach(p => console.log(`  [${p.isActive ? 'ACTIVE' : 'inactive'}] ${p.slug} — ${p.name}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
