import { useCallback, useEffect, useState } from 'react';
import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_KEYS,
  LEADERBOARD_MIN_RANKED,
  type DifficultyKey,
  type LeaderboardBoard,
  type LeaderboardResponse,
  type LeaderboardRowDto,
  type LeaderboardWindowParam,
} from '@starspell/shared';
import { fetchLeaderboard } from '../api/leaderboards';
import { ApiError } from '../api/client';

export interface LeaderboardsModalProps {
  open: boolean;
  difficulty: DifficultyKey;
  onClose: () => void;
}

export function LeaderboardsModal({ open, difficulty, onClose }: LeaderboardsModalProps) {
  const [board, setBoard] = useState<LeaderboardBoard>('rating');
  const [selectedDiff, setSelectedDiff] = useState<DifficultyKey>(difficulty);
  const [windowParam, setWindowParam] = useState<LeaderboardWindowParam>('all');
  const [rows, setRows] = useState<LeaderboardRowDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [resetAtUtc, setResetAtUtc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(
    async (cursor?: string) => {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const res: LeaderboardResponse = await fetchLeaderboard({
          board,
          difficulty: selectedDiff,
          window: board === 'rating' ? 'all' : windowParam,
          cursor,
          limit: 20,
        });
        setRows((prev) => (cursor ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
        setResetAtUtc(res.resetAtUtc);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load leaderboards.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [board, selectedDiff, windowParam],
  );

  useEffect(() => {
    if (!open) return;
    void loadBoard();
  }, [open, loadBoard]);

  if (!open) return null;

  return (
    <div
      id="leaderboards-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Leaderboards"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-2xl text-amber-50">Leaderboards</h2>
          <button
            id="btn-close-leaderboards"
            type="button"
            aria-label="Close Leaderboards"
            onClick={onClose}
            className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-100 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1 rounded-full bg-slate-950/50 border border-amber-200/15">
          {(['rating', 'competition', 'survival'] as const).map((b) => (
            <button
              key={b}
              id={`tab-lb-${b}`}
              type="button"
              onClick={() => setBoard(b)}
              className={`rounded-full py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                board === b ? 'bg-amber-300 text-slate-950' : 'text-amber-100/80'
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        {board !== 'rating' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {DIFFICULTY_KEYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDiff(d)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold cursor-pointer ${
                    selectedDiff === d
                      ? 'bg-amber-300/25 border border-amber-300 text-amber-50'
                      : 'twilight-pill text-amber-100/75'
                  }`}
                >
                  {DIFFICULTY_CONFIGS[d].label}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5">
              {(['all', 'weekly', 'monthly'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowParam(w)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize cursor-pointer ${
                    windowParam === w
                      ? 'bg-amber-300/25 border border-amber-300 text-amber-50'
                      : 'twilight-pill text-amber-100/75'
                  }`}
                >
                  {w === 'all' ? 'All-time' : w}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-amber-100/70">
            Requires at least {LEADERBOARD_MIN_RANKED} ranked multiplayer matches.
          </p>
        )}

        {resetAtUtc && (
          <p id="lb-utc-reset" className="text-[11px] text-amber-200/75">
            Window resets at {new Date(resetAtUtc).toUTCString()}
          </p>
        )}

        {loading && (
          <p id="lb-loading" className="text-sm text-amber-100/80 py-6 text-center">
            Loading rankings…
          </p>
        )}

        {!loading && error && (
          <div id="lb-error" className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-xs text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => void loadBoard()}
              className="twilight-pill rounded-full px-4 py-1.5 text-xs font-semibold text-amber-100 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p id="lb-empty" className="text-xs text-amber-100/70 py-6 text-center">
            No validated multiplayer entries for this filter yet.
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div id="lb-rows" className="flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={`${r.rank}-${r.username}`}
                className="twilight-pill rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-amber-100"
              >
                <span className="font-semibold text-amber-50">
                  #{r.rank} @{r.username}
                </span>
                <span className="tabular-nums font-bold text-amber-200">
                  {board === 'rating'
                    ? `${r.value} MMR`
                    : board === 'survival'
                      ? `${r.value} words (${r.secondaryValue ?? 0} pts)`
                      : `${r.value} pts`}
                </span>
              </div>
            ))}
          </div>
        )}

        {nextCursor && !loading && (
          <button
            id="btn-lb-load-more"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadBoard(nextCursor)}
            className="twilight-pill rounded-full py-2 text-xs font-semibold text-amber-100 cursor-pointer self-center px-6"
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
        )}
      </div>
    </div>
  );
}
