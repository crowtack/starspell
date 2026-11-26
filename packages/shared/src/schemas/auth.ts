import { z } from 'zod';
import { DifficultyKeySchema, SaveDataSchema, SettingsSchema } from './save.js';

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;
export const AVATAR_IDS = ['lantern', 'sun', 'moon', 'canyon', 'comet', 'pine'] as const;
export const AvatarIdSchema = z.enum(AVATAR_IDS);
export type AvatarId = z.infer<typeof AvatarIdSchema>;

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  username: z
    .string()
    .trim()
    .regex(USERNAME_REGEX, 'Username must be 3-24 characters (letters, numbers, _ or -)'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * Allow-listed mutable profile fields only.
 * Unknown/privileged fields (xp, level, imported, highScore, etc.) are stripped.
 */
export const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatarId: AvatarIdSchema.optional(),
  bio: z.string().trim().max(160).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const UpdateSettingsSchema = SettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export const GuestImportPreviewSchema = z.object({
  saveData: SaveDataSchema,
});
export type GuestImportPreviewInput = z.infer<typeof GuestImportPreviewSchema>;

export const GuestImportConfirmSchema = z.object({
  importId: z.string().uuid(),
  saveData: SaveDataSchema,
});
export type GuestImportConfirmInput = z.infer<typeof GuestImportConfirmSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorSchema>;

export const AccountUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  createdAt: z.string(),
});
export type AccountUser = z.infer<typeof AccountUserSchema>;

export const AccountProfileSchema = z.object({
  displayName: z.string(),
  avatarId: AvatarIdSchema,
  bio: z.string(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  highScore: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  wordsSolved: z.number().int().nonnegative(),
  constellationsCleared: z.number().int().nonnegative(),
  imported: z.boolean(),
  rating: z.number().int().default(1000).optional(),
  rankedMatches: z.number().int().nonnegative().default(0).optional(),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

export const AccountDifficultyStatSchema = z.object({
  difficulty: DifficultyKeySchema,
  unlocked: z.boolean(),
  completed: z.boolean(),
  highScore: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  wordsSolved: z.number().int().nonnegative(),
  runsCleared: z.number().int().nonnegative(),
});
export type AccountDifficultyStat = z.infer<typeof AccountDifficultyStatSchema>;

export const AuthMeResponseSchema = z.object({
  user: AccountUserSchema,
  profile: AccountProfileSchema,
  settings: SettingsSchema,
  difficulties: z.array(AccountDifficultyStatSchema),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const GuestImportPreviewResponseSchema = z.object({
  alreadyImported: z.boolean(),
  accountHasProgress: z.boolean(),
  defaultAction: z.enum(['import', 'skip']),
  guestXp: z.number().int().nonnegative(),
  cappedXpDelta: z.number().int().nonnegative(),
  resultingXp: z.number().int().nonnegative(),
  resultingLevel: z.number().int().min(1),
  guestWordsSolved: z.number().int().nonnegative(),
  guestHighScore: z.number().int().nonnegative(),
  guestBestStreak: z.number().int().nonnegative(),
});
export type GuestImportPreviewResponse = z.infer<typeof GuestImportPreviewResponseSchema>;

export const GuestImportConfirmResponseSchema = z.object({
  applied: z.boolean(),
  idempotentReplay: z.boolean(),
  xpAdded: z.number().int().nonnegative(),
  profile: AccountProfileSchema,
  difficulties: z.array(AccountDifficultyStatSchema),
});
export type GuestImportConfirmResponse = z.infer<typeof GuestImportConfirmResponseSchema>;
