import { DIFFICULTY_CONFIGS, type DifficultyKey, type WordRecord } from '@starspell/shared';

export interface SummaryModalProps {
  open: boolean;
  victory: boolean;
  difficulty: DifficultyKey;
  chapter: number;
  score: number;
  bestStreak: number;
  xpEarned: number;
  missedWord: WordRecord | null;
  onNextChapter: () => void;
  onReplayStage: () => void;
  onReturnToLobby: () => void;
}

export function SummaryModal({
  open,
  victory,
  difficulty,
  chapter,
  score,
  bestStreak,
  xpEarned,
  missedWord,
  onNextChapter,
  onReplayStage,
  onReturnToLobby,
}: SummaryModalProps) {
  const cfg = DIFFICULTY_CONFIGS[difficulty];
  const showMissed = !victory && missedWord !== null;

  return (
    <div
      id="summary-overlay"
      className={`fixed inset-0 z-50 items-center justify-center p-4 bg-black/55 backdrop-blur-sm ${
        open ? 'flex' : 'hidden'
      }`}
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-md p-6 sm:p-7 flex flex-col items-center text-center gap-5">
        <div
          id="summary-badge"
          className="twilight-pill rounded-full px-4 py-1 text-xs font-semibold text-amber-200"
        >
          {victory ? `Chapter ${chapter} Complete` : 'Dusk Settled'}
        </div>
        <h2
          id="summary-heading"
          className="font-display font-bold text-3xl sm:text-4xl text-amber-50"
        >
          {victory ? 'Ridge Illuminated' : 'Lanterns Dimmed'}
        </h2>

        <div
          id="summary-missed-box"
          className={`w-full twilight-pill rounded-3xl px-4 py-3 text-center ${
            showMissed ? '' : 'hidden'
          }`}
        >
          <p className="text-[11px] uppercase tracking-wider text-rose-200/80 font-semibold">
            Final Lantern Word
          </p>
          <p
            id="summary-missed-word"
            className="font-display font-bold text-2xl text-amber-50 mt-0.5 tracking-wide"
          >
            {missedWord ? missedWord.word.toUpperCase() : ''}
          </p>
          <p id="summary-missed-def" className="text-xs text-amber-100/75 mt-1">
            {missedWord ? missedWord.definition : ''}
          </p>
        </div>

        <div className="w-full grid grid-cols-3 gap-2.5">
          <div className="twilight-pill rounded-3xl p-3">
            <div className="text-[11px] text-amber-100/70">Score</div>
            <div
              id="sum-score"
              className="font-display font-bold text-xl text-amber-50 tabular-nums mt-0.5"
            >
              {score.toLocaleString()}
            </div>
          </div>
          <div className="twilight-pill rounded-3xl p-3">
            <div className="text-[11px] text-amber-100/70">Best Streak</div>
            <div
              id="sum-streak"
              className="font-display font-bold text-xl text-amber-50 tabular-nums mt-0.5"
            >
              {bestStreak}
            </div>
          </div>
          <div className="twilight-pill rounded-3xl p-3">
            <div className="text-[11px] text-amber-100/70">XP Earned</div>
            <div
              id="sum-xp"
              className="font-display font-bold text-xl text-amber-50 tabular-nums mt-0.5"
            >
              +{xpEarned}
            </div>
          </div>
        </div>

        <div className="w-full flex flex-col gap-2.5">
          <button
            id="btn-next-chapter"
            type="button"
            onClick={onNextChapter}
            className={`w-full rounded-full py-3.5 font-semibold text-sm sm:text-base text-slate-950 bg-gradient-to-r ${
              cfg.ctaClasses
            } cursor-pointer hover:scale-[1.01] transition ${victory ? '' : 'hidden'}`}
          >
            Next Chapter →
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              id="btn-replay-stage"
              type="button"
              onClick={onReplayStage}
              className="twilight-pill rounded-full py-3 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 cursor-pointer"
            >
              Replay Stage
            </button>
            <button
              id="btn-summary-lobby"
              type="button"
              onClick={onReturnToLobby}
              className="twilight-pill rounded-full py-3 text-xs sm:text-sm font-semibold text-amber-100/85 hover:border-amber-200/40 cursor-pointer"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
