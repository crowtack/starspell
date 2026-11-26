import { PrismaClient } from '@prisma/client';
import { ORIGINAL_WORDS, ORIGINAL_WORDS_VERSION } from '@starspell/shared';
import { pathToFileURL } from 'node:url';

/**
 * Idempotently upserts the 110 canonical words into the Word table.
 * Running multiple times leaves exactly 110 rows with identical definitions.
 */
export async function seedOriginalWords(prisma: PrismaClient): Promise<number> {
  await prisma.$transaction(
    ORIGINAL_WORDS.map((record) =>
      prisma.word.upsert({
        where: { id: record.id },
        update: {
          word: record.word,
          tier: record.tier,
          definition: record.definition,
          version: ORIGINAL_WORDS_VERSION,
        },
        create: {
          id: record.id,
          word: record.word,
          tier: record.tier,
          definition: record.definition,
          version: ORIGINAL_WORDS_VERSION,
        },
      }),
    ),
  );
  return ORIGINAL_WORDS.length;
}

const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const prisma = new PrismaClient();
  seedOriginalWords(prisma)
    .then((count) => {
      process.stdout.write(
        `Seeded ${String(count)} canonical words (${ORIGINAL_WORDS_VERSION}).\n`,
      );
    })
    .catch((err: unknown) => {
      process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
