import { z } from 'zod';
import { DifficultyKeySchema } from './save.js';

export const ACTIVE_CHECKPOINT_STORAGE_KEY = 'starspell_active_v1';
export const ACTIVE_CHECKPOINT_SCHEMA_VERSION = 1;

export const WayfaringStyleSchema = z.enum(['STARLIGHT', 'ECHO', 'FLASH']);
export type WayfaringStyle = z.infer<typeof WayfaringStyleSchema>;

export const WordRecordSchema = z.object({
  id: z.string().min(1),
  word: z.string().min(1),
  definition: z.string().min(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const SoloStatusSchema = z.enum(['idle', 'playing', 'victory', 'failed']);

export const SoloStateSchema = z.object({
  status: SoloStatusSchema,
  difficulty: DifficultyKeySchema,
  chapter: z.number().int().min(1),
  seed: z.number().int().nonnegative(),
  wordIndex: z.number().int().nonnegative(),
  slots: z.array(WordRecordSchema).readonly(),
  usedWordIds: z.array(z.string()).readonly(),
  skipCount: z.number().int().nonnegative(),
  score: z.number().finite().nonnegative(),
  streak: z.number().int().nonnegative(),
  bestChapterStreak: z.number().int().nonnegative(),
  chapterXp: z.number().finite().nonnegative(),
  totalXp: z.number().finite().nonnegative(),
  level: z.number().int().min(1),
  timeLeft: z.number().finite().nonnegative(),
  wordsSolved: z.number().int().nonnegative(),
  constellationsCleared: z.number().int().nonnegative(),
  runsCleared: z.number().int().nonnegative(),
  missedWord: WordRecordSchema.nullable(),
});

export const ActiveCheckpointSchema = z.object({
  schemaVersion: z.literal(ACTIVE_CHECKPOINT_SCHEMA_VERSION),
  style: WayfaringStyleSchema,
  soloState: SoloStateSchema,
  elapsedSinceLastEvent: z.number().finite().nonnegative(),
  savedAt: z.number().finite().nonnegative(),
});

export type ActiveCheckpoint = z.infer<typeof ActiveCheckpointSchema>;

export function parseActiveCheckpoint(raw: unknown): ActiveCheckpoint | null {
  const parsed = ActiveCheckpointSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  if (parsed.data.soloState.status !== 'playing') {
    return null;
  }
  return parsed.data;
}
