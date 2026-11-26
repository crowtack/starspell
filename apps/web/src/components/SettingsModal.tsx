import { DIFFICULTY_CONFIGS, type DifficultyKey, type UserSettingsSave } from '@starspell/shared';

export interface SettingsModalProps {
  open: boolean;
  difficulty: DifficultyKey;
  settings: UserSettingsSave;
  onChange: (patch: Partial<UserSettingsSave>) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  difficulty,
  settings,
  onChange,
  onClose,
}: SettingsModalProps) {
  const cfg = DIFFICULTY_CONFIGS[difficulty];
  const masterPct = Math.round(settings.masterVol * 100);
  const musicPct = Math.round(settings.musicVol * 100);
  const sfxPct = Math.round(settings.sfxVol * 100);

  return (
    <div
      id="settings-overlay"
      className={`fixed inset-0 z-50 items-center justify-center p-4 bg-black/50 backdrop-blur-sm ${
        open ? 'flex' : 'hidden'
      }`}
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-2xl text-amber-50">Sound &amp; Scenery</h2>
          <button
            id="btn-close-settings"
            type="button"
            onClick={onClose}
            className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-100 hover:text-white cursor-pointer"
            aria-label="Close Settings"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold text-amber-100/90">
              <span>Master Volume</span>
              <span id="val-master-vol" className="tabular-nums">
                {masterPct}%
              </span>
            </div>
            <input
              id="rng-master-vol"
              type="range"
              min="0"
              max="100"
              value={masterPct}
              onChange={(e) => onChange({ masterVol: Number(e.target.value) / 100 })}
              className="celestial-range"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold text-amber-100/90">
              <span>Ambient Sunset Music</span>
              <span id="val-music-vol" className="tabular-nums">
                {musicPct}%
              </span>
            </div>
            <input
              id="rng-music-vol"
              type="range"
              min="0"
              max="100"
              value={musicPct}
              onChange={(e) => onChange({ musicVol: Number(e.target.value) / 100 })}
              className="celestial-range"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold text-amber-100/90">
              <span>Chimes &amp; Keystrokes</span>
              <span id="val-sfx-vol" className="tabular-nums">
                {sfxPct}%
              </span>
            </div>
            <input
              id="rng-sfx-vol"
              type="range"
              min="0"
              max="100"
              value={sfxPct}
              onChange={(e) => onChange({ sfxVol: Number(e.target.value) / 100 })}
              className="celestial-range"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2.5 pt-1">
          <label className="twilight-pill rounded-full px-4 py-2.5 flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-amber-50">Background Music</span>
            <input
              id="chk-music-enabled"
              type="checkbox"
              className="accent-amber-400 w-4 h-4 cursor-pointer"
              checked={settings.musicEnabled}
              onChange={(e) => onChange({ musicEnabled: e.target.checked })}
            />
          </label>
          <label className="twilight-pill rounded-full px-4 py-2.5 flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-amber-50">Soft Typing Sounds</span>
            <input
              id="chk-typing-sfx"
              type="checkbox"
              className="accent-amber-400 w-4 h-4 cursor-pointer"
              checked={settings.typingSfxEnabled}
              onChange={(e) => onChange({ typingSfxEnabled: e.target.checked })}
            />
          </label>
          <label className="twilight-pill rounded-full px-4 py-2.5 flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-amber-50">Milestone Chimes</span>
            <input
              id="chk-game-sfx"
              type="checkbox"
              className="accent-amber-400 w-4 h-4 cursor-pointer"
              checked={settings.gameSfxEnabled}
              onChange={(e) => onChange({ gameSfxEnabled: e.target.checked })}
            />
          </label>
          <label className="twilight-pill rounded-full px-4 py-2.5 flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-amber-50">Reduce Motion</span>
            <input
              id="chk-reduce-motion"
              type="checkbox"
              className="accent-amber-400 w-4 h-4 cursor-pointer"
              checked={settings.reducedEffects}
              onChange={(e) => onChange({ reducedEffects: e.target.checked })}
            />
          </label>
        </div>

        <button
          id="btn-save-settings"
          type="button"
          onClick={onClose}
          className={`w-full rounded-full py-3 font-semibold text-sm text-slate-950 bg-gradient-to-r cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition ${cfg.ctaClasses}`}
        >
          Done
        </button>
      </div>
    </div>
  );
}
