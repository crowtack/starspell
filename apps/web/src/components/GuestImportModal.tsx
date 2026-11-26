import { useEffect, useRef, useState } from 'react';
import {
  DIFFICULTY_CONFIGS,
  type DifficultyKey,
  type GuestImportConfirmResponse,
  type GuestImportPreviewResponse,
  type SaveData,
} from '@starspell/shared';
import { confirmGuestImport, previewGuestImport } from '../api/auth';
import { ApiError } from '../api/client';

export interface GuestImportModalProps {
  open: boolean;
  difficulty: DifficultyKey;
  saveData: SaveData;
  onImported: (result: GuestImportConfirmResponse) => void;
  onClose: () => void;
}

export function GuestImportModal({
  open,
  difficulty,
  saveData,
  onImported,
  onClose,
}: GuestImportModalProps) {
  const [preview, setPreview] = useState<GuestImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    importIdRef.current = crypto.randomUUID();
    setLoading(true);
    setError(null);
    previewGuestImport({ saveData })
      .then((res) => setPreview(res))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Unable to preview guest progress.');
      })
      .finally(() => setLoading(false));
  }, [open, saveData]);

  if (!open) return null;

  const cfg = DIFFICULTY_CONFIGS[difficulty];

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await confirmGuestImport({
        importId: importIdRef.current,
        saveData,
      });
      onImported(result);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import guest progress.');
    } finally {
      setSubmitting(false);
    }
  };

  const preferSkip = preview?.defaultAction === 'skip';

  return (
    <div
      id="guest-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Import Device Progress"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-2xl text-amber-50">Import Device Progress</h2>
          <button
            id="btn-close-guest-import"
            type="button"
            onClick={onClose}
            className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-100 hover:text-white cursor-pointer"
            aria-label="Close Guest Import"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-amber-100/80">Checking local save data…</p>}

        {error && (
          <p className="rounded-xl px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-300/30">
            {error}
          </p>
        )}

        {preview && !loading && (
          <>
            <p className="text-xs sm:text-sm text-amber-100/85 leading-relaxed">
              {preview.alreadyImported
                ? 'This account has already imported guest progress.'
                : preview.accountHasProgress
                  ? 'Your account already has progress. Skipping is recommended, or you can merge your device bests (XP capped).'
                  : 'Found local progress stored on this device. Import it into your account?'}
            </p>

            <div className="twilight-pill rounded-2xl p-3.5 flex flex-col gap-1.5 text-xs text-amber-100/90 tabular-nums">
              <div className="flex justify-between">
                <span>Device XP / Capped Delta</span>
                <span className="font-semibold">
                  {preview.guestXp} → +{preview.cappedXpDelta} XP
                </span>
              </div>
              <div className="flex justify-between">
                <span>Resulting Level / XP</span>
                <span className="font-semibold">
                  Lv.{preview.resultingLevel} ({preview.resultingXp} XP)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Device High Score / Streak</span>
                <span className="font-semibold">
                  {preview.guestHighScore} / {preview.guestBestStreak}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Device Words Solved</span>
                <span className="font-semibold">{preview.guestWordsSolved}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-1">
              <button
                id="btn-skip-guest-import"
                type="button"
                onClick={onClose}
                className={
                  preferSkip
                    ? `rounded-full px-5 py-2.5 font-semibold text-sm text-slate-950 bg-gradient-to-r cursor-pointer ${cfg.ctaClasses}`
                    : 'twilight-pill rounded-full px-4 py-2.5 text-xs font-semibold text-amber-100 hover:border-amber-200/40 cursor-pointer'
                }
              >
                {preferSkip ? 'Skip (Recommended)' : 'Skip'}
              </button>

              {!preview.alreadyImported && (
                <button
                  id="btn-confirm-guest-import"
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleConfirm()}
                  className={
                    !preferSkip
                      ? `rounded-full px-5 py-2.5 font-semibold text-sm text-slate-950 bg-gradient-to-r cursor-pointer disabled:opacity-60 ${cfg.ctaClasses}`
                      : 'twilight-pill rounded-full px-4 py-2.5 text-xs font-semibold text-amber-200 hover:border-amber-200/40 cursor-pointer disabled:opacity-60'
                  }
                >
                  {submitting ? 'Importing…' : 'Confirm Import'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
