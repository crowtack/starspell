export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 6;
export const ROOM_IDLE_EXPIRY_MS = 15 * 60 * 1000;
export const ROOM_FINISHED_EXPIRY_MS = 10 * 60 * 1000;
export const MATCH_COUNTDOWN_SECONDS = 5;

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function generateRoomCode(rng: () => number): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const idx = Math.floor(rng() * ROOM_CODE_ALPHABET.length);
    out += ROOM_CODE_ALPHABET[idx] ?? 'A';
  }
  return out;
}

export type CompetitionPlayerOutcome = 'finished' | 'forfeit' | 'interrupted';

export interface CompetitionRankInput {
  readonly userId: string;
  readonly outcome: CompetitionPlayerOutcome;
  readonly score: number;
  readonly wordsSolved: number;
  readonly elapsedActiveMs: number;
}

export interface CompetitionRankedEntry<T extends CompetitionRankInput> {
  readonly entry: T;
  readonly rank: number;
  readonly isDraw: boolean;
}

/**
 * Ranks competition players per GAME_RULES.md §12.3 & §12.6:
 * - Non-forfeit players always rank above forfeit players.
 * - Non-forfeit order: score desc -> wordsSolved desc -> elapsedActiveMs asc -> userId asc.
 * - Forfeit vs forfeit counts as a draw (same rank, isDraw = true).
 */
export function rankCompetitionResults<T extends CompetitionRankInput>(
  entries: readonly T[],
): CompetitionRankedEntry<T>[] {
  const nonForfeits = entries
    .filter((e) => e.outcome !== 'forfeit')
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wordsSolved !== a.wordsSolved) return b.wordsSolved - a.wordsSolved;
      if (a.elapsedActiveMs !== b.elapsedActiveMs) return a.elapsedActiveMs - b.elapsedActiveMs;
      return a.userId.localeCompare(b.userId);
    });

  const forfeits = entries
    .filter((e) => e.outcome === 'forfeit')
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const ranked: CompetitionRankedEntry<T>[] = [];
  for (let i = 0; i < nonForfeits.length; i += 1) {
    const entry = nonForfeits[i];
    if (!entry) continue;
    ranked.push({ entry, rank: i + 1, isDraw: false });
  }

  const forfeitRank = nonForfeits.length + 1;
  const forfeitDraw = forfeits.length > 1;
  for (const entry of forfeits) {
    ranked.push({ entry, rank: forfeitRank, isDraw: forfeitDraw });
  }

  return ranked;
}
