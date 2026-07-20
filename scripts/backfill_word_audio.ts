import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { ElevenLabsClient } from '../src/jobs/clients/ElevenLabsClient';
import { CloudinaryService } from '../src/services/CloudinaryService';

dotenv.config();

type CliOptions = {
  language?: string;
  profession?: string;
  limit?: number;
  dryRun: boolean;
};

function printHelp(): void {
  console.log(`
Backfill missing WordAudioCache entries for published scenario lessons.

Usage:
  npm run audio:backfill -- --language es
  npm run audio:backfill -- --language es --profession healthcare --limit 20 --dry-run

Options:
  --language <code>     Restrict to one target language (e.g. es, de, fr)
  --profession <slug>   Restrict to one profession slug
  --limit <n>           Cap the number of words processed this run
  --dry-run             List words that would be backfilled without calling ElevenLabs/Cloudinary
  --help                Show this help
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
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
      case '--profession':
        options.profession = value;
        index += 1;
        break;
      case '--limit': {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = parsed;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const ttsClient = new ElevenLabsClient();
  const cloudinaryService = new CloudinaryService();

  try {
    const words = await prisma.scenarioWord.findMany({
      where: {
        lesson: {
          status: 'PUBLISHED',
          ...(options.language ? { language: options.language } : {}),
          ...(options.profession
            ? { subcategory: { profession: { slug: options.profession } } }
            : {}),
        },
        audioCache: {
          none: {},
        },
      },
      select: {
        id: true,
        word: true,
        ipa: true,
        lesson: {
          select: { id: true, language: true },
        },
      },
      ...(options.limit ? { take: options.limit } : {}),
    });

    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          language: options.language ?? 'all',
          profession: options.profession ?? 'all',
          missingWords: words.length,
          limit: options.limit ?? null,
        },
        null,
        2,
      ),
    );

    if (words.length === 0) {
      console.log('No words missing audio for the given filters.');
      return;
    }

    const voiceConfigCache = new Map<string, { voiceId: string | undefined; dictionaryId: string | null }>();

    let succeeded = 0;
    let skippedNoAudio = 0;
    let failedUpload = 0;

    for (const word of words) {
      const language = word.lesson.language;

      if (options.dryRun) {
        console.log(`DRY-RUN: would generate audio for word="${word.word}" (${language}, wordId=${word.id})`);
        continue;
      }

      if (!voiceConfigCache.has(language)) {
        voiceConfigCache.set(language, await ElevenLabsClient.resolveVoiceConfig(prisma, language));
      }
      const { voiceId, dictionaryId } = voiceConfigCache.get(language)!;

      const audioData = await ttsClient.generateSpeech(word.word, language, {
        singleWordMode: true,
        voiceId,
        ipa: word.ipa ?? undefined,
        pronunciationDictionaryId: dictionaryId ?? undefined,
      });

      if (!audioData) {
        skippedNoAudio += 1;
        console.warn(`No audio returned for wordId=${word.id} word="${word.word}" language=${language}`);
        continue;
      }

      try {
        const uploaded = await cloudinaryService.uploadAudioDataUri(
          audioData,
          `coachplingo/lesson-audio/${language}`,
        );

        await prisma.wordAudioCache.upsert({
          where: { wordId_language: { wordId: word.id, language } },
          update: { audioUrl: uploaded.secureUrl },
          create: { wordId: word.id, language, audioUrl: uploaded.secureUrl },
        });

        succeeded += 1;
        console.log(`Backfilled audio for wordId=${word.id} word="${word.word}" (${language})`);
      } catch (error) {
        failedUpload += 1;
        console.error(
          `Upload failed for wordId=${word.id} word="${word.word}" language=${language}: ${error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error as object))}`,
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          total: words.length,
          succeeded,
          skippedNoAudio,
          failedUpload,
          dryRun: options.dryRun,
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
  console.error(error);
  process.exit(1);
});
