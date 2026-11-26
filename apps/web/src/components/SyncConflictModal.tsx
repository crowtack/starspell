import { DIFFICULTY_CONFIGS, type DifficultyKey, type SoloSessionDto } from '@starspell/shared';

export interface SyncConflictModalProps {
  open: boolean;
  difficulty: DifficultyKey;
  serverSession: SoloSessionDto | null;
  localWordIndex: number;
  localScore: number;
  onKeepServer: () => void;
  onKeepLocal: () => void;
}

export function SyncConflictModal({
  open,
  difficulty,
  serverSession,
  localWordIndex,
  localScore,
  onKeepServer,
  onKeepLocal,
}: SyncConflictModalProps) {
  if (!open) return null;
  const cfg = DIFFICULTY_CONFIGS[difficulty];

  return (
    <div
      id="sync-conflict-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Progress Conflict Detected"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-md p-6 flex flex-col gap-4">
        <h2 className="font-display font-bold text-2xl text-amber-50">
          Progress Conflict Detected
        </h2>
        <p className="text-xs sm:text-sm text-amber-100/85 leading-relaxed">
          Another device or tab updated your solo chapter. Choose which progress to continue with.
          The other version will be preserved as an abandoned session (never deleted).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="twilight-pill rounded-2xl p-3 flex flex-col gap-1">
            <span className="font-semibold text-amber-200">Server Progress</span>
            {serverSession ? (
              <>
                <span className="text-amber-100/85 tabular-nums">
                  Word {serverSession.state.wordIndex + 1} • Score {serverSession.state.score}
                </span>
                <span className="text-amber-100/65 tabular-nums">
                  Streak {serverSession.state.streak}
                </span>
              </>
            ) : (
              <span className="text-amber-100/75">Ahead of local log</span>
            )}
          </div>

          <div className="twilight-pill rounded-2xl p-3 flex flex-col gap-1">
            <span className="font-semibold text-amber-200">This Device</span>
            <span className="text-amber-100/85 tabular-nums">
              Word {localWordIndex + 1} • Score {localScore}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-1">
          <button
            id="btn-conflict-keep-server"
            type="button"
            onClick={onKeepServer}
            className={`flex-1 rounded-full py-2.5 px-4 font-semibold text-xs sm:text-sm text-slate-950 bg-gradient-to-r cursor-pointer ${cfg.ctaClasses}`}
          >
            Use Server Progress
          </button>
          <button
            id="btn-conflict-keep-local"
            type="button"
            onClick={onKeepLocal}
            className="flex-1 twilight-pill rounded-full py-2.5 px-4 font-semibold text-xs sm:text-sm text-amber-100 hover:border-amber-200/40 cursor-pointer"
          >
            Keep This Device
          </button>
        </div>
      </div>
    </div>
  );
}
