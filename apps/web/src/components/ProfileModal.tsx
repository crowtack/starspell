import { useEffect, useState, type FormEvent } from 'react';
import {
  AVATAR_IDS,
  DIFFICULTY_CONFIGS,
  type AuthMeResponse,
  type AvatarId,
  type DifficultyKey,
  type PublicProfileDto,
  type UpdateProfileInput,
} from '@starspell/shared';
import { ApiError } from '../api/client';
import { fetchPublicProfile } from '../api/leaderboards';

const AVATAR_LABELS: Record<AvatarId, string> = {
  lantern: 'Lantern',
  sun: 'Sunburst',
  moon: 'Crescent',
  canyon: 'Canyon',
  comet: 'Comet',
  pine: 'Pine',
};

export interface ProfileModalProps {
  open: boolean;
  account: AuthMeResponse | null;
  difficulty: DifficultyKey;
  onSave: (input: UpdateProfileInput) => Promise<void>;
  onOpenGuestImport?: () => void;
  onClose: () => void;
}

export function ProfileModal({
  open,
  account,
  difficulty,
  onSave,
  onOpenGuestImport,
  onClose,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [avatarId, setAvatarId] = useState<AvatarId>('lantern');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publicDetails, setPublicDetails] = useState<PublicProfileDto | null>(null);

  useEffect(() => {
    if (account && open) {
      setDisplayName(account.profile.displayName);
      setAvatarId(account.profile.avatarId);
      setBio(account.profile.bio);
      setStatusMsg(null);
      setError(null);
      void fetchPublicProfile(account.user.username)
        .then(setPublicDetails)
        .catch(() => setPublicDetails(null));
    }
  }, [account, open]);

  if (!open || !account) return null;

  const cfg = DIFFICULTY_CONFIGS[difficulty];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    try {
      await onSave({
        displayName: displayName.trim(),
        avatarId,
        bio: bio.trim(),
      });
      setStatusMsg('Profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="profile-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Wayfarer Profile"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-lg p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-2xl text-amber-50">Wayfarer Profile</h2>
            <p className="text-xs text-amber-100/70">@{account.user.username}</p>
          </div>
          <button
            id="btn-close-profile"
            type="button"
            onClick={onClose}
            className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-100 hover:text-white cursor-pointer"
            aria-label="Close Profile"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
          <div className="twilight-pill rounded-2xl p-2.5">
            <div className="text-[11px] text-amber-100/70">Level</div>
            <div id="profile-stat-level" className="font-display font-bold text-lg text-amber-50">
              {account.profile.level}
            </div>
          </div>
          <div className="twilight-pill rounded-2xl p-2.5">
            <div className="text-[11px] text-amber-100/70">XP</div>
            <div id="profile-stat-xp" className="font-display font-bold text-lg text-amber-50">
              {account.profile.xp}
            </div>
          </div>
          <div className="twilight-pill rounded-2xl p-2.5">
            <div className="text-[11px] text-amber-100/70">High Score</div>
            <div
              id="profile-stat-highscore"
              className="font-display font-bold text-lg text-amber-50"
            >
              {account.profile.highScore}
            </div>
          </div>
          <div className="twilight-pill rounded-2xl p-2.5">
            <div className="text-[11px] text-amber-100/70">Rating</div>
            <div id="profile-stat-rating" className="font-display font-bold text-lg text-amber-200">
              {publicDetails?.rating ?? account.profile.rating ?? 1000}
            </div>
          </div>
        </div>

        {publicDetails && publicDetails.ratingHistory.length > 0 && (
          <div id="profile-rating-history" className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-amber-100/90">Recent Rating Changes</span>
            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
              {publicDetails.ratingHistory.slice(0, 5).map((rh) => (
                <div
                  key={rh.matchId}
                  className="twilight-pill rounded-xl px-3 py-1.5 flex justify-between text-[11px] text-amber-100/85 tabular-nums"
                >
                  <span>
                    {rh.ratingBefore} → {rh.ratingAfter}
                  </span>
                  <span className={rh.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {rh.delta >= 0 ? '+' : ''}
                    {rh.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {account.profile.imported && (
          <div
            id="profile-imported-badge"
            className="twilight-pill rounded-full px-3.5 py-1 text-xs font-semibold text-amber-200 self-start"
          >
            Includes imported device progress
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-xs">
          {account.difficulties.map((stat) => (
            <div key={stat.difficulty} className="twilight-pill rounded-2xl p-2.5">
              <div className="font-semibold text-amber-100">
                {DIFFICULTY_CONFIGS[stat.difficulty].label}
              </div>
              <div className="text-amber-100/75 mt-0.5 tabular-nums">Best {stat.highScore}</div>
              <div className="text-amber-100/60 tabular-nums">Streak {stat.bestStreak}</div>
            </div>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-amber-100/90">Display Name</span>
            <input
              id="input-profile-displayname"
              type="text"
              required
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-xl px-3.5 py-2 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50 focus:outline-none focus:border-amber-300/60"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-amber-100/90">Emblem</span>
            <div className="grid grid-cols-3 gap-2">
              {AVATAR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAvatarId(id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition cursor-pointer ${
                    avatarId === id
                      ? 'bg-amber-300/20 border-amber-300 text-amber-50'
                      : 'bg-slate-950/40 border-amber-200/15 text-amber-100/75 hover:border-amber-200/40'
                  }`}
                >
                  {AVATAR_LABELS[id]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-amber-100/90">Bio</span>
            <textarea
              id="input-profile-bio"
              rows={2}
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A brief note about your canyon journey…"
              className="rounded-xl px-3.5 py-2 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50 focus:outline-none focus:border-amber-300/60 resize-none"
            />
          </label>

          {error && <p className="text-xs text-rose-200">{error}</p>}
          {statusMsg && <p className="text-xs text-emerald-200">{statusMsg}</p>}

          <div className="flex items-center justify-between gap-3 mt-1">
            {onOpenGuestImport && !account.profile.imported ? (
              <button
                id="btn-open-guest-import"
                type="button"
                onClick={onOpenGuestImport}
                className="twilight-pill rounded-full px-4 py-2 text-xs font-semibold text-amber-200 hover:border-amber-200/40 cursor-pointer"
              >
                Import Device Progress
              </button>
            ) : (
              <span />
            )}

            <button
              id="btn-save-profile"
              type="submit"
              disabled={saving}
              className={`rounded-full px-6 py-2.5 font-semibold text-sm text-slate-950 bg-gradient-to-r transition cursor-pointer disabled:opacity-60 ${cfg.ctaClasses}`}
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
