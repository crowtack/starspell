import { z } from 'zod';
import { AvatarIdSchema } from './auth.js';
import { MatchHistoryItemSchema } from './multiplayer.js';
import { DifficultyKeySchema } from './save.js';

export const LeaderboardBoardSchema = z.enum(['rating', 'competition', 'survival']);
export type LeaderboardBoard = z.infer<typeof LeaderboardBoardSchema>;

export const LeaderboardWindowSchema = z.enum(['all', 'weekly', 'monthly']);
export type LeaderboardWindowParam = z.infer<typeof LeaderboardWindowSchema>;

export const LeaderboardQuerySchema = z.object({
  board: LeaderboardBoardSchema.default('rating'),
  difficulty: DifficultyKeySchema.default('EASY'),
  window: LeaderboardWindowSchema.default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type LeaderboardQueryInput = z.infer<typeof LeaderboardQuerySchema>;

export const LeaderboardRowDtoSchema = z.object({
  rank: z.number().int().min(1),
  username: z.string(),
  avatarId: AvatarIdSchema,
  value: z.number().int().nonnegative(),
  secondaryValue: z.number().int().nonnegative().optional(),
  achievedAt: z.string(),
});
export type LeaderboardRowDto = z.infer<typeof LeaderboardRowDtoSchema>;

export const LeaderboardResponseSchema = z.object({
  board: LeaderboardBoardSchema,
  difficulty: DifficultyKeySchema,
  window: LeaderboardWindowSchema,
  items: z.array(LeaderboardRowDtoSchema),
  nextCursor: z.string().nullable(),
  resetAtUtc: z.string().nullable(),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

export const RatingHistoryItemSchema = z.object({
  matchId: z.string(),
  ratingBefore: z.number().int(),
  ratingAfter: z.number().int(),
  delta: z.number().int(),
  kFactor: z.number().int(),
  createdAt: z.string(),
});
export type RatingHistoryItem = z.infer<typeof RatingHistoryItemSchema>;

export const PublicProfileSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  avatarId: AvatarIdSchema,
  bio: z.string(),
  level: z.number().int().min(1),
  rating: z.number().int(),
  rankedMatches: z.number().int().nonnegative(),
  highScore: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  wordsSolved: z.number().int().nonnegative(),
  constellationsCleared: z.number().int().nonnegative(),
  ratingHistory: z.array(RatingHistoryItemSchema),
  recentMatches: z.array(MatchHistoryItemSchema),
});
export type PublicProfileDto = z.infer<typeof PublicProfileSchema>;
