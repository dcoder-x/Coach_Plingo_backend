import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { CloudinaryService } from '../src/services/CloudinaryService';

dotenv.config();

type CliOptions = {
  limit?: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--limit') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --limit');
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--limit must be a positive integer');
      }

      options.limit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const cloudinaryService = new CloudinaryService();

  try {
    const records = await prisma.wordAudioCache.findMany({
      where: {
        audioUrl: {
          startsWith: 'data:audio/',
        },
      },
      orderBy: {
        updatedAt: 'asc',
      },
      ...(options.limit ? { take: options.limit } : {}),
    });

    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          selectedRecords: records.length,
          limit: options.limit ?? null,
        },
        null,
        2,
      ),
    );

    if (records.length === 0) {
      console.log('No base64 records found in WordAudioCache.');
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const record of records) {
      if (options.dryRun) {
        console.log(`DRY-RUN: would migrate wordAudioCache.id=${record.id} language=${record.language}`);
        continue;
      }

      try {
        const uploaded = await cloudinaryService.uploadAudioDataUri(
          record.audioUrl,
          `coachplingo/lesson-audio/${record.language}`,
        );

        await prisma.wordAudioCache.update({
          where: { id: record.id },
          data: {
            audioUrl: uploaded.secureUrl,
          },
        });

        migrated += 1;
        console.log(`Migrated wordAudioCache.id=${record.id} -> ${uploaded.secureUrl}`);
      } catch (error) {
        failed += 1;
        console.error(
          `Failed wordAudioCache.id=${record.id} language=${record.language}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          total: records.length,
          migrated,
          failed,
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
