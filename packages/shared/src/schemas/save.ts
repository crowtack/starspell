import { z } from 'zod';
import type { DifficultyKey } from '../rules/difficulties.js';

export const SAVE_STORAGE_KEY = 'starspell_celestial_v1';
export const SAVE_SCHEMA_VERSION = 1;

export const DifficultyKeySchema = z.enum(['EASY', 'INTERMEDIATE', 'HARD']);

export const ProfileStatsSchema = z.object({
  xp: z.number().finite().nonnegative().default(0),
  level: z.number().int().min(1).default(1),
  highScore: z.number().finite().nonnegative().default(0),
  bestStreak: z.number().int().nonnegative().default(0),
  wordsSolved: z.number().int().nonnegative().default(0),
  constellationsCleared: z.number().int().nonnegative().default(0),
});

export const DifficultyProgressSchema = z.object({
  unlocked: z.boolean().default(true),
  completed: z.boolean().default(false),
  highScore: z.number().finite().nonnegative().default(0),
  bestStreak: z.number().int().nonnegative().default(0),
  wordsSolved: z.number().int().nonnegative().default(0),
  runsCleared: z.number().int().nonnegative().default(0),
});

export const SettingsSchema = z.object({
  masterVol: z.number().finite().min(0).max(1).default(0.8),
  musicVol: z.number().finite().min(0).max(1).default(0.65),
  sfxVol: z.number().finite().min(0).max(1).default(0.85),
  musicEnabled: z.boolean().default(true),
  typingSfxEnabled: z.boolean().default(true),
  gameSfxEnabled: z.boolean().default(true),
  reducedEffects: z.boolean().default(false),
});

export const SaveDataSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION).default(SAVE_SCHEMA_VERSION),
  profile: ProfileStatsSchema,
  selectedDifficulty: DifficultyKeySchema.default('EASY'),
  difficulties: z.object({
    EASY: DifficultyProgressSchema,
    INTERMEDIATE: DifficultyProgressSchema,
    HARD: DifficultyProgressSchema,
  }),
  settings: SettingsSchema,
});

export type ProfileStats = z.infer<typeof ProfileStatsSchema>;
export type DifficultyProgress = z.infer<typeof DifficultyProgressSchema>;
export type UserSettingsSave = z.infer<typeof SettingsSchema>;
export type SaveData = z.infer<typeof SaveDataSchema>;

function createDefaultDifficultyProgress(): DifficultyProgress {
  return {
    unlocked: true,
    completed: false,
    highScore: 0,
    bestStreak: 0,
    wordsSolved: 0,
    runsCleared: 0,
  };
}

export function createDefaultSaveData(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    profile: {
      xp: 0,
      level: 1,
      highScore: 0,
      bestStreak: 0,
      wordsSolved: 0,
      constellationsCleared: 0,
    },
    selectedDifficulty: 'EASY',
    difficulties: {
      EASY: createDefaultDifficultyProgress(),
      INTERMEDIATE: createDefaultDifficultyProgress(),
      HARD: createDefaultDifficultyProgress(),
    },
    settings: {
      masterVol: 0.8,
      musicVol: 0.65,
      sfxVol: 0.85,
      musicEnabled: true,
      typingSfxEnabled: true,
      gameSfxEnabled: true,
      reducedEffects: false,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mergeSection<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  rawSection: unknown,
  defaults: T,
): T {
  const parsed = schema.safeParse({
    ...asRecord(defaults),
    ...asRecord(rawSection),
  });
  return parsed.success ? parsed.data : defaults;
}

/**
 * Parses either a prototype save (no schemaVersion) or a v1 save,
 * merging over defaults and always enforcing unlocked: true for all difficulties.
 */
export function parseSaveData(raw: unknown): SaveData {
  const defaults = createDefaultSaveData();
  const root = asRecord(raw);
  const rawDifficulties = asRecord(root['difficulties']);

  const selectedParsed = DifficultyKeySchema.safeParse(root['selectedDifficulty']);
  const selectedDifficulty: DifficultyKey = selectedParsed.success ? selectedParsed.data : 'EASY';

  const easy = mergeSection(
    DifficultyProgressSchema,
    rawDifficulties['EASY'],
    defaults.difficulties.EASY,
  );
  const intermediate = mergeSection(
    DifficultyProgressSchema,
    rawDifficulties['INTERMEDIATE'],
    defaults.difficulties.INTERMEDIATE,
  );
  const hard = mergeSection(
    DifficultyProgressSchema,
    rawDifficulties['HARD'],
    defaults.difficulties.HARD,
  );

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    profile: mergeSection(ProfileStatsSchema, root['profile'], defaults.profile),
    selectedDifficulty,
    difficulties: {
      EASY: { ...easy, unlocked: true },
      INTERMEDIATE: { ...intermediate, unlocked: true },
      HARD: { ...hard, unlocked: true },
    },
    settings: mergeSection(SettingsSchema, root['settings'], defaults.settings),
  };
}
