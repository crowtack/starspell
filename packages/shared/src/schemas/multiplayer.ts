import { z } from 'zod';
import { AvatarIdSchema } from './auth.js';
import { WayfaringStyleSchema, WordRecordSchema } from './checkpoint.js';
import { DifficultyKeySchema } from './save.js';

export const MULTIPLAYER_ENVELOPE_VERSION = 1;

export const MatchModeSchema = z.enum(['COMPETITION', 'SURVIVAL']);
export type MatchMode = z.infer<typeof MatchModeSchema>;

export const MultiplayerEnvelopeSchema = z.object({
  v: z.literal(MULTIPLAYER_ENVELOPE_VERSION),
  type: z.string().min(1),
  eventId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  roomCode: z.string(),
  matchId: z.string().optional(),
  ts: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export interface MultiplayerEnvelope<T = unknown> {
  readonly v: 1;
  readonly type: string;
  readonly eventId: string;
  readonly seq: number;
  readonly roomCode: string;
  readonly matchId?: string;
  readonly ts: number;
  readonly payload: T;
}

export const CreateRoomPayloadSchema = z.object({
  difficulty: DifficultyKeySchema.default('EASY'),
  style: WayfaringStyleSchema.default('STARLIGHT'),
  mode: MatchModeSchema.default('COMPETITION'),
  isRanked: z.boolean().default(false),
});
export type CreateRoomPayload = z.infer<typeof CreateRoomPayloadSchema>;

export const JoinRoomPayloadSchema = z.object({
  code: z.string().min(1).max(24),
});
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

export const SetReadyPayloadSchema = z.object({
  ready: z.boolean(),
});
export type SetReadyPayload = z.infer<typeof SetReadyPayloadSchema>;

export const UpdateRoomSettingsPayloadSchema = z.object({
  difficulty: DifficultyKeySchema.optional(),
  style: WayfaringStyleSchema.optional(),
  mode: MatchModeSchema.optional(),
  isRanked: z.boolean().optional(),
});
export type UpdateRoomSettingsPayload = z.infer<typeof UpdateRoomSettingsPayloadSchema>;

export const WordSolvePayloadSchema = z.object({
  slot: z.number().int().nonnegative(),
  answer: z.string().min(1).max(64),
});
export type WordSolvePayload = z.infer<typeof WordSolvePayloadSchema>;

export const WordSkipPayloadSchema = z.object({
  slot: z.number().int().nonnegative(),
});
export type WordSkipPayload = z.infer<typeof WordSkipPayloadSchema>;

export const RoomPlayerDtoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarId: AvatarIdSchema,
  isReady: z.boolean(),
  isConnected: z.boolean(),
  isOwner: z.boolean(),
});
export type RoomPlayerDto = z.infer<typeof RoomPlayerDtoSchema>;

export const RoomSnapshotSchema = z.object({
  id: z.string(),
  code: z.string(),
  ownerId: z.string(),
  difficulty: DifficultyKeySchema,
  style: WayfaringStyleSchema,
  mode: MatchModeSchema.default('COMPETITION'),
  status: z.enum(['waiting', 'countdown', 'active', 'finished', 'expired']),
  isRanked: z.boolean(),
  maxWords: z.number().int().positive().default(15),
  players: z.array(RoomPlayerDtoSchema),
  matchId: z.string().nullable(),
  countdownEndsAt: z.number().nullable(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const OpponentProgressSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarId: AvatarIdSchema,
  wordIndex: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  timeLeft: z.number().nonnegative(),
  isConnected: z.boolean(),
  status: z.enum(['playing', 'finished', 'forfeit', 'interrupted']),
});
export type OpponentProgress = z.infer<typeof OpponentProgressSchema>;

export const WordIssuePayloadSchema = z.object({
  matchId: z.string(),
  slot: z.number().int().nonnegative(),
  currentWord: WordRecordSchema.nullable(),
  nextWord: WordRecordSchema.nullable(),
  score: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  timeLeft: z.number().nonnegative(),
  status: z.enum(['playing', 'finished', 'forfeit', 'interrupted']),
});
export type WordIssuePayload = z.infer<typeof WordIssuePayloadSchema>;

export const MatchResultPlayerDtoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  rank: z.number().int().min(1),
  isDraw: z.boolean(),
  status: z.enum(['finished', 'forfeit', 'interrupted']),
  score: z.number().int().nonnegative(),
  wordsSolved: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  elapsedActiveMs: z.number().int().nonnegative(),
  xpAwarded: z.number().int().nonnegative(),
  ratingBefore: z.number().int().optional(),
  ratingAfter: z.number().int().optional(),
  ratingDelta: z.number().int().optional(),
});
export type MatchResultPlayerDto = z.infer<typeof MatchResultPlayerDtoSchema>;

export const MatchResultsPayloadSchema = z.object({
  matchId: z.string(),
  roomCode: z.string(),
  mode: MatchModeSchema.default('COMPETITION'),
  isRanked: z.boolean().default(false),
  status: z.enum(['completed', 'interrupted', 'cancelled', 'invalid']),
  difficulty: DifficultyKeySchema,
  style: WayfaringStyleSchema,
  results: z.array(MatchResultPlayerDtoSchema),
});
export type MatchResultsPayload = z.infer<typeof MatchResultsPayloadSchema>;

export const MatchHistoryItemSchema = z.object({
  matchId: z.string(),
  roomCode: z.string(),
  mode: MatchModeSchema.default('COMPETITION'),
  isRanked: z.boolean().default(false),
  difficulty: DifficultyKeySchema,
  style: WayfaringStyleSchema,
  matchStatus: z.string(),
  rank: z.number().int().min(1),
  isDraw: z.boolean(),
  playerStatus: z.string(),
  score: z.number().int().nonnegative(),
  wordsSolved: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  xpAwarded: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type MatchHistoryItem = z.infer<typeof MatchHistoryItemSchema>;
