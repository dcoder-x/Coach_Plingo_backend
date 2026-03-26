import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
];

const professions = [
  { slug: 'software_engineer', name: 'Software Engineer' },
  { slug: 'product_manager', name: 'Product Manager' },
  { slug: 'data_analyst', name: 'Data Analyst' },
  { slug: 'marketing_manager', name: 'Marketing Manager' },
  { slug: 'sales_representative', name: 'Sales Representative' },
  { slug: 'nurse', name: 'Nurse' },
  { slug: 'doctor', name: 'Doctor' },
  { slug: 'teacher', name: 'Teacher' },
  { slug: 'lawyer', name: 'Lawyer' },
  { slug: 'entrepreneur', name: 'Entrepreneur' },
];

async function main(): Promise<void> {
  for (const language of languages) {
    await prisma.languageOption.upsert({
      where: { code: language.code },
      update: {
        name: language.name,
        isActive: true,
      },
      create: {
        code: language.code,
        name: language.name,
        isActive: true,
      },
    });
  }

  for (const profession of professions) {
    await prisma.professionOption.upsert({
      where: { slug: profession.slug },
      update: {
        name: profession.name,
        isActive: true,
      },
      create: {
        slug: profession.slug,
        name: profession.name,
        isActive: true,
      },
    });
  }

  console.log(`Seeded ${languages.length} languages and ${professions.length} professions`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
