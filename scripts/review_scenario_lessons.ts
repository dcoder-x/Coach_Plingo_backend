import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

type CliOptions = {
  language: string;
  profession: string;
  subcategory?: string;
  scenario?: string;
  limit: number;
};

function printHelp(): void {
  console.log(`
Review persisted V3 scenario lessons from the database.

Usage:
  npm run lessons:review -- --language es --profession software_engineer

Options:
  --language <code>       Target lesson language. Default: es
  --profession <slug>     Profession slug from ProfessionOption. Default: software_engineer
  --subcategory <slug|id> Restrict to one subcategory by slug or id
  --scenario <slug|id>    Restrict to one scenario by slug or id
  --limit <n>             Maximum lessons to print. Default: 3
  --help                  Show this help
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    language: 'es',
    profession: 'software_engineer',
    limit: 3,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
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
      case '--limit':
        options.limit = Number.parseInt(value, 10);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error('--limit must be a positive integer');
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const profession = await prisma.professionOption.findUnique({
      where: { slug: options.profession },
      select: { id: true, slug: true, name: true },
    });

    if (!profession) {
      throw new Error(`Profession not found: ${options.profession}`);
    }

    const lessons = await prisma.scenarioLesson.findMany({
      where: {
        language: options.language,
        status: 'PUBLISHED',
        scenario: {
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
        subcategory: options.subcategory
          ? {
            OR: [
              { id: options.subcategory },
              { slug: options.subcategory },
            ],
          }
          : undefined,
      },
      include: {
        subcategory: {
          select: {
            id: true,
            slug: true,
            name: true,
            position: true,
          },
        },
        scenario: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            position: true,
          },
        },
        words: {
          include: {
            translations: true,
          },
          orderBy: { position: 'asc' },
        },
        comprehensions: {
          include: {
            questions: {
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: [
        { subcategory: { position: 'asc' } },
        { scenarioPosition: 'asc' },
      ],
      take: options.limit,
    });

    if (lessons.length === 0) {
      console.log(
        JSON.stringify(
          {
            found: 0,
            message: 'No published lessons matched the supplied filters.',
            filters: options,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          found: lessons.length,
          language: options.language,
          profession: profession.slug,
          lessons: lessons.map((lesson) => ({
            lessonId: lesson.id,
            subcategory: {
              id: lesson.subcategory.id,
              slug: lesson.subcategory.slug,
              name: lesson.subcategory.name,
              position: lesson.subcategory.position,
            },
            scenario: {
              id: lesson.scenario.id,
              slug: lesson.scenario.slug,
              name: lesson.scenario.displayName,
              position: lesson.scenario.position,
            },
            publishedAt: lesson.publishedAt,
            words: lesson.words.map((word) => ({
              position: word.position,
              word: word.word,
              ipa: word.ipa,
              complexityLevel: word.complexityLevel,
              tags: Array.isArray(word.tags) ? word.tags : [],
              examplePhrases: Array.isArray(word.examplePhrases)
                ? word.examplePhrases
                  .filter((entry): entry is { text?: unknown; translation?: unknown } => {
                    return typeof entry === 'object' && entry !== null;
                  })
                  .map((entry) => ({
                    text: typeof entry.text === 'string' ? entry.text : '',
                    translation: typeof entry.translation === 'string' ? entry.translation : '',
                  }))
                  .filter((entry) => entry.text.length > 0 || entry.translation.length > 0)
                : [],
              fillGapSentences: Array.isArray(word.exampleSentences)
                ? word.exampleSentences
                    .filter((entry): entry is { template?: unknown; answer?: unknown; templateTranslation?: unknown } => {
                      return typeof entry === 'object' && entry !== null;
                    })
                    .map((entry) => ({
                      template: typeof entry.template === 'string' ? entry.template : '',
                      answer: typeof entry.answer === 'string' ? entry.answer : '',
                      ...(typeof entry.templateTranslation === 'string' && {
                        templateTranslation: entry.templateTranslation,
                      }),
                    }))
                : [],
              translations: word.translations.map((translation) => ({
                baseLanguage: translation.baseLanguage,
                translation: translation.translation,
              })),
            })),
            comprehensions: lesson.comprehensions.map((block) => ({
              position: block.position,
              content: block.content,
              ...(typeof block.contentTranslation === 'string' && {
                contentTranslation: block.contentTranslation,
              }),
              questions: block.questions.map((question) => ({
                position: question.position,
                questionText: question.questionText,
                questionType: question.questionType,
                options: Array.isArray(question.options) ? question.options : [],
                correctAnswer: question.correctAnswer,
                ...(typeof question.questionTranslation === 'string' && {
                  questionTranslation: question.questionTranslation,
                }),
                ...(Array.isArray(question.optionsTranslation) && question.optionsTranslation.length > 0 && {
                  optionsTranslation: question.optionsTranslation,
                }),
              })),
            })),
          })),
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