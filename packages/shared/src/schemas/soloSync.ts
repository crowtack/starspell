import { z } from 'zod';
import { SoloStateSchema, WayfaringStyleSchema } from './checkpoint.js';
import { DifficultyKeySchema } from './save.js';

export const SOLO_WORD_BANK_VERSION = 'original-v1';
export const MAX_SOLO_EVENT_BATCH = 50;

export const SyncStatusSchema = z.enum(['synced', 'saving', 'offline', 'needs_attention']);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const SoloSessionStatusSchema = z.enum(['active', 'completed', 'failed', 'abandoned']);
export type SoloSessionStatus = z.infer<typeof SoloSessionStatusSchema>;

export const CreateSoloSessionSchema = z.object({
  clientSessionId: z.string().uuid(),
  difficulty: DifficultyKeySchema,
  style: WayfaringStyleSchema,
  seed: z.number().int().nonnegative(),
  wordBankVersion: z.string().min(1).max(64).default(SOLO_WORD_BANK_VERSION),
});
export type CreateSoloSessionInput = z.infer<typeof CreateSoloSessionSchema>;

export const SoloSyncEventTypeSchema = z.enum([
  'chapter_started',
  'word_solved',
  'word_skipped',
  'clock_expired',
  'chapter_finished',
]);
export type SoloSyncEventType = z.infer<typeof SoloSyncEventTypeSchema>;

export const SoloSyncEventSchema = z.object({
  eventId: z.string().uuid(),
  seq: z.number().int().min(1),
  type: SoloSyncEventTypeSchema,
  chapter: z.number().int().min(1).optional(),
  seed: z.number().int().nonnegative().optional(),
  keepRun: z.boolean().optional(),
  slot: z.number().int().nonnegative().optional(),
  answer: z.string().max(64).optional(),
  elapsedSeconds: z.number().finite().nonnegative().optional(),
  elapsedMs: z.number().finite().nonnegative().optional(),
});
export type SoloSyncEventInput = z.infer<typeof SoloSyncEventSchema>;

export const AppendSoloEventsSchema = z.object({
  baseSeq: z.number().int().nonnegative(),
  events: z.array(SoloSyncEventSchema).min(1).max(MAX_SOLO_EVENT_BATCH),
});
export type AppendSoloEventsInput = z.infer<typeof AppendSoloEventsSchema>;

export const AbandonSoloSessionSchema = z.object({
  reason: z.enum(['user', 'conflict']).default('user'),
});
export type AbandonSoloSessionInput = z.infer<typeof AbandonSoloSessionSchema>;

export const SoloSessionDtoSchema = z.object({
  id: z.string(),
  clientSessionId: z.string(),
  seed: z.number().int().nonnegative(),
  difficulty: DifficultyKeySchema,
  style: WayfaringStyleSchema,
  wordBankVersion: z.string(),
  status: SoloSessionStatusSchema,
  abandonReason: z.string().nullable(),
  version: z.number().int().nonnegative(),
  state: SoloStateSchema,
  updatedAt: z.string(),
});
export type SoloSessionDto = z.infer<typeof SoloSessionDtoSchema>;

export const AppendSoloEventsResultSchema = z.object({
  session: SoloSessionDtoSchema,
  idempotentReplay: z.boolean(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  rejectedEventIds: z.array(z.string()),
  xpCredited: z.number().int().nonnegative(),
});
export type AppendSoloEventsResult = z.infer<typeof AppendSoloEventsResultSchema>;
