import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { ContentService } from '../src/services/ContentService';

dotenv.config();

type CliOptions = {
  language: string;
  baseLanguage: string;
  profession: string;
  subcategory?: string;
  scenario?: string;
  subcategoryLimit?: number;
  scenarioLimit?: number;
  forceRegenerate: boolean;
  includeSamples: boolean;
};

function printHelp(): void {
  console.log(`
Generate and persist V3 scenario lessons using the real ContentService pipeline.

Usage:
  npm run lessons:generate -- --language es --base-language en --profession software_engineer

Options:
  --language <code>            Target lesson language. Default: es
  --base-language <code>       Translation language used during generation. Default: en
  --profession <slug>          Profession slug from ProfessionOption. Default: software_engineer
  --subcategory <slug|id>      Restrict to one subcategory by slug or id
  --scenario <slug|id>         Restrict to one scenario by slug or id
  --subcategory-limit <n>      Limit how many subcategories to generate
  --scenario-limit <n>         Limit how many scenarios per subcategory to generate
  --force-regenerate           Delete existing generated content before regenerating
  --include-samples            Print sample words and passage excerpts for review
  --help                       Show this help

Examples:
  npm run lessons:generate -- --language es --profession software_engineer --subcategory meetings --scenario standup_meeting
  npm run lessons:generate -- --language es --profession product_manager --subcategory-limit 1 --scenario-limit 2 --include-samples
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    language: 'es',
    baseLanguage: 'en',
    profession: 'software_engineer',
    forceRegenerate: false,
    includeSamples: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--force-regenerate') {
      options.forceRegenerate = true;
      continue;
    }

    if (arg === '--include-samples') {
      options.includeSamples = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--language':
        options.language = value;
        index += 1;
        break;
      case '--base-language':
        options.baseLanguage = value;
        index += 1;
        break;
      case '--profession':
        options.profession = value;
        index += 1;
        break;
      case '--subcategory':
        options.subcategory = value;
        index += 1;
        break;
      case '--scenario':
        options.scenario = value;
        index += 1;
        break;
      case '--subcategory-limit':
        options.subcategoryLimit = Number.parseInt(value, 10);
        index += 1;
        break;
      case '--scenario-limit':
        options.scenarioLimit = Number.parseInt(value, 10);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.subcategoryLimit !== undefined && (!Number.isInteger(options.subcategoryLimit) || options.subcategoryLimit < 1)) {
    throw new Error('--subcategory-limit must be a positive integer');
  }

  if (options.scenarioLimit !== undefined && (!Number.isInteger(options.scenarioLimit) || options.scenarioLimit < 1)) {
    throw new Error('--scenario-limit must be a positive integer');
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const contentService = new ContentService(prisma);

  try {
    const profession = await prisma.professionOption.findUnique({
      where: { slug: options.profession },
      select: { id: true, slug: true, name: true },
    });

    if (!profession) {
      throw new Error(`Profession not found: ${options.profession}`);
    }

    const subcategories = await prisma.professionSubcategory.findMany({
      where: {
        professionId: profession.id,
        ...(options.subcategory
          ? {
            OR: [
              { id: options.subcategory },
              { slug: options.subcategory },
            ],
          }
          : {}),
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        position: true,
      },
      ...(options.subcategoryLimit ? { take: options.subcategoryLimit } : {}),
    });

    if (subcategories.length === 0) {
      throw new Error('No matching subcategories found for the selected profession');
    }

    const scenarios = await prisma.professionScenario.findMany({
      where: {
        professionId: profession.id,
        ...(options.scenario
          ? {
            OR: [
              { id: options.scenario },
              { slug: options.scenario },
            ],
          }
          : {}),
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        slug: true,
        displayName: true,
        description: true,
        position: true,
      },
      ...(options.scenarioLimit ? { take: options.scenarioLimit } : {}),
    });

    if (scenarios.length === 0) {
      throw new Error('No matching scenarios found for the selected profession');
    }

    console.log(
      JSON.stringify(
        {
          mode: contentService.getContentMode(),
          language: options.language,
          baseLanguage: options.baseLanguage,
          profession: profession.slug,
          subcategories: subcategories.map((item) => ({ id: item.id, slug: item.slug, position: item.position })),
          scenarios: scenarios.map((item) => ({ id: item.id, slug: item.slug, position: item.position })),
          forceRegenerate: options.forceRegenerate,
        },
        null,
        2,
      ),
    );

    const results: Array<Record<string, unknown>> = [];

    for (const subcategory of subcategories) {
      for (const scenario of scenarios) {
        if (options.forceRegenerate) {
          await prisma.scenarioLesson.deleteMany({
            where: {
              subcategoryId: subcategory.id,
              scenarioId: scenario.id,
              language: options.language,
            },
          });
        }

        const generated = await contentService.getOrGenerateLesson({
          professionId: profession.id,
          subcategoryId: subcategory.id,
          scenarioId: scenario.id,
          language: options.language,
          baseLanguage: options.baseLanguage,
        });

        if (!generated.ready) {
          results.push({
            subcategory: subcategory.slug || subcategory.id,
            scenario: scenario.slug,
            ready: false,
            status: generated.status,
          });
          continue;
        }

        results.push({
          subcategory: subcategory.slug || subcategory.id,
          scenario: scenario.slug,
          ready: true,
          lessonId: generated.lesson.id,
          lessonStatus: generated.lesson.status,
          wordCount: generated.lesson.words.length,
          comprehensionCount: generated.lesson.comprehensions.length,
          words: options.includeSamples
            ? generated.lesson.words
              .sort((a, b) => a.position - b.position)
              .slice(0, 3)
              .map((word) => ({
                word: word.word,
                translation: word.translations[0]?.translation ?? null,
                fillGapTemplate: Array.isArray(word.exampleSentences)
                  ? ((word.exampleSentences[0] as { template?: unknown } | undefined)?.template ?? null)
                  : null,
              }))
            : undefined,
          passageExcerpt: options.includeSamples
            ? generated.lesson.comprehensions
              .sort((a, b) => a.position - b.position)[0]
              ?.content.slice(0, 220)
            : undefined,
        });
      }
    }

    const readyCount = results.filter((entry) => entry.ready === true).length;
    const pendingCount = results.length - readyCount;

    console.log(
      JSON.stringify(
        {
          generatedLessons: readyCount,
          pendingLessons: pendingCount,
          totalAttempts: results.length,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});