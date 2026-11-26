import { DIFFICULTY_CONFIGS, type DifficultyKey } from '@starspell/shared';

export type ConfirmDialogMode = 'leave_chapter' | 'abandon_checkpoint';

export interface ConfirmDialogProps {
  mode: ConfirmDialogMode | null;
  difficulty: DifficultyKey;
  onSaveAndLeave?: () => void;
  onAbandon: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  mode,
  difficulty,
  onSaveAndLeave,
  onAbandon,
  onCancel,
}: ConfirmDialogProps) {
  if (!mode) {
    return null;
  }

  const cfg = DIFFICULTY_CONFIGS[difficulty];
  const isLeave = mode === 'leave_chapter';

  return (
    <div
      id="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-heading"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-md p-6 sm:p-7 flex flex-col gap-4 text-center">
        <h2 id="confirm-heading" className="font-display font-bold text-2xl text-amber-50">
          {isLeave ? 'Leave Active Chapter?' : 'Abandon Saved Chapter?'}
        </h2>
        <p className="text-xs sm:text-sm text-amber-100/80 leading-relaxed">
          {isLeave
            ? 'You can save your current lantern progress to resume later from the lobby, or abandon this chapter.'
            : 'Discarding your saved chapter removes your checkpoint progress. XP from words already solved remains saved.'}
        </p>

        <div className="flex flex-col gap-2.5 pt-1">
          {isLeave && onSaveAndLeave && (
            <button
              id="btn-confirm-save-leave"
              type="button"
              onClick={onSaveAndLeave}
              className={`w-full rounded-full py-3 font-semibold text-sm text-slate-950 bg-gradient-to-r ${cfg.ctaClasses} cursor-pointer hover:scale-[1.01] transition`}
            >
              Save &amp; Return to Lobby
            </button>
          )}
          <button
            id="btn-confirm-abandon"
            type="button"
            onClick={onAbandon}
            className="w-full rounded-full py-3 text-sm font-semibold text-rose-100 bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/30 cursor-pointer transition"
          >
            {isLeave ? 'Abandon Chapter' : 'Discard Saved Chapter'}
          </button>
          <button
            id="btn-confirm-cancel"
            type="button"
            onClick={onCancel}
            className="twilight-pill w-full rounded-full py-3 text-sm font-semibold text-amber-100/90 hover:border-amber-200/40 cursor-pointer transition"
          >
            {isLeave ? 'Keep Playing' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
