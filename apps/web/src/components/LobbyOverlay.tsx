import {
  DIFFICULTY_CONFIGS,
  WORDS_PER_CHAPTER,
  type ActiveCheckpoint,
  type AuthMeResponse,
  type DifficultyKey,
  type SaveData,
  type SyncStatus,
  type WayfaringStyle,
} from '@starspell/shared';
import { SyncStatusBadge } from './SyncStatusBadge';

export interface LobbyOverlayProps {
  visible: boolean;
  step: 'LOBBY' | 'MODE_SELECT';
  selectedDifficulty: DifficultyKey;
  selectedMode: WayfaringStyle;
  ambientOn: boolean;
  saveData: SaveData;
  savedCheckpoint: ActiveCheckpoint | null;
  account?: AuthMeResponse | null;
  syncStatus?: SyncStatus | null;
  onRetrySync?: () => void;
  onToggleAmbient: () => void;
  onOpenSettings: () => void;
  onOpenAuth?: (tab?: 'login' | 'register') => void;
  onOpenProfile?: () => void;
  onOpenGuestImport?: () => void;
  onOpenMultiplayer?: () => void;
  onOpenLeaderboards?: () => void;
  onLogout?: () => void;
  onSelectDifficulty: (diff: DifficultyKey) => void;
  onToModes: () => void;
  onBackToLobby: () => void;
  onSelectMode: (mode: WayfaringStyle) => void;
  onBeginJourney: () => void;
  onResumeCheckpoint: () => void;
  onAbandonCheckpoint: () => void;
}

const DIFFICULTY_CARDS: ReadonlyArray<{
  key: DifficultyKey;
  label: string;
  name: string;
  tagline: string;
  hoverBorder: string;
  dotColor: string;
  subColor: string;
}> = [
  {
    key: 'EASY',
    label: 'Easy',
    name: 'Sunset Breeze',
    tagline: 'Warm golden canyon',
    hoverBorder: 'hover:border-amber-200/40',
    dotColor: 'bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.8)]',
    subColor: 'text-yellow-200/90',
  },
  {
    key: 'INTERMEDIATE',
    label: 'Intermediate',
    name: 'Twilight Journey',
    tagline: 'Moonlit indigo canyon',
    hoverBorder: 'hover:border-indigo-300/40',
    dotColor: 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]',
    subColor: 'text-indigo-200/90',
  },
  {
    key: 'HARD',
    label: 'Hard',
    name: 'Eclipse of the Summit',
    tagline: 'Crimson lunar eclipse',
    hoverBorder: 'hover:border-rose-300/40',
    dotColor: 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]',
    subColor: 'text-rose-200/90',
  },
];

const MODE_CARDS: ReadonlyArray<{
  key: WayfaringStyle;
  title: string;
  badge: string;
  badgeClasses: string;
  desc: string;
}> = [
  {
    key: 'STARLIGHT',
    title: 'Storybook',
    badge: 'Guided',
    badgeClasses: 'bg-amber-300/15 text-amber-200',
    desc: 'Displays the storybook clue, spoken pronunciation, and a brief 750ms opening letter lantern glow.',
  },
  {
    key: 'ECHO',
    title: 'Evening Echo',
    badge: 'Listening',
    badgeClasses: 'bg-indigo-300/15 text-indigo-200',
    desc: 'Hides the opening letter glow. Trust your ear with spoken voice audio and the canyon definition.',
  },
  {
    key: 'FLASH',
    title: 'Sunbeam',
    badge: 'Memory',
    badgeClasses: 'bg-rose-300/15 text-rose-200',
    desc: 'Illuminates the entire word in warm amber for 1100ms before fading into silent lantern medallions.',
  },
];

export function LobbyOverlay({
  visible,
  step,
  selectedDifficulty,
  selectedMode,
  ambientOn,
  saveData,
  savedCheckpoint,
  account = null,
  syncStatus = null,
  onRetrySync,
  onToggleAmbient,
  onOpenSettings,
  onOpenAuth,
  onOpenProfile,
  onOpenGuestImport,
  onOpenMultiplayer,
  onOpenLeaderboards,
  onLogout,
  onSelectDifficulty,
  onToModes,
  onBackToLobby,
  onSelectMode,
  onBeginJourney,
  onResumeCheckpoint,
  onAbandonCheckpoint,
}: LobbyOverlayProps) {
  const cfg = DIFFICULTY_CONFIGS[selectedDifficulty];
  const diffStats = saveData.difficulties[selectedDifficulty];

  return (
    <div
      id="start-overlay"
      className={`fixed inset-0 z-30 flex flex-col justify-between p-4 sm:p-6 transition-opacity duration-500 ${
        visible ? '' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Top Floating Lobby Bar */}
      <div className="w-full flex items-center justify-between gap-3">
        <button
          id="btn-lobby-ambient"
          type="button"
          onClick={onToggleAmbient}
          className="twilight-pill rounded-full px-4 py-2 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
        >
          <span
            id="lobby-ambient-dot"
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              ambientOn
                ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]'
                : 'bg-amber-300/60'
            }`}
          />
          <span id="lobby-ambient-label">
            {ambientOn ? `${cfg.ambientLabel} On` : `Play ${cfg.ambientLabel}`}
          </span>
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {account && syncStatus && <SyncStatusBadge status={syncStatus} onRetry={onRetrySync} />}
          {account ? (
            <>
              <button
                id="btn-account-profile"
                type="button"
                onClick={onOpenProfile}
                className="twilight-pill rounded-full px-3.5 py-2 flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
              >
                <span>@{account.user.username}</span>
                <span className="text-amber-200/80 text-xs">Lv.{account.profile.level}</span>
              </button>
              <button
                id="btn-account-logout"
                type="button"
                onClick={onLogout}
                className="twilight-pill rounded-full px-3.5 py-2 text-xs sm:text-sm font-semibold text-amber-100/85 hover:border-amber-200/40 transition cursor-pointer"
              >
                Sign Out
              </button>
            </>
          ) : (
            onOpenAuth && (
              <button
                id="btn-account-signin"
                type="button"
                onClick={() => onOpenAuth('login')}
                className="twilight-pill rounded-full px-4 py-2 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
              >
                Sign In / Sign Up
              </button>
            )
          )}

          <button
            id="btn-lobby-settings"
            type="button"
            onClick={onOpenSettings}
            className="twilight-pill rounded-full px-4 py-2 flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
          >
            <svg
              className="w-4 h-4 opacity-85"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Sound &amp; Scenery</span>
          </button>
        </div>
      </div>

      {/* Step 1: Open-Air Lobby View */}
      <div
        id="lobby-view"
        className={`lobby-scrim my-auto mx-auto w-full max-w-3xl px-4 py-6 sm:py-8 rounded-[2.5rem] flex-col items-center text-center gap-4 sm:gap-5 transition-all duration-300 ${
          step === 'LOBBY' ? 'flex' : 'hidden'
        }`}
      >
        <div
          id="lobby-stage-pill"
          className="twilight-pill rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold text-amber-100/95 tracking-wide"
        >
          Difficulty: {cfg.label} • {cfg.name}
        </div>

        <h1 className="font-display font-bold text-5xl sm:text-7xl tracking-tight text-amber-50 drop-shadow-[0_6px_26px_rgba(10,4,12,0.7)]">
          Star
          <span
            id="title-accent"
            className={`bg-gradient-to-r ${cfg.ctaClasses} bg-clip-text text-transparent`}
          >
            spell
          </span>
        </h1>

        <p
          id="lobby-description"
          className="text-sm sm:text-base text-amber-100/90 max-w-xl leading-relaxed drop-shadow-[0_2px_10px_rgba(10,4,12,0.8)]"
        >
          {cfg.description}
        </p>

        {/* 3-Column Difficulty Selector */}
        <div
          id="lobby-difficulty-grid"
          className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mt-1"
        >
          {DIFFICULTY_CARDS.map((card) => {
            const isSel = card.key === selectedDifficulty;
            return (
              <button
                key={card.key}
                type="button"
                data-diff={card.key}
                onClick={() => onSelectDifficulty(card.key)}
                className={`diff-card twilight-glass rounded-full sm:rounded-3xl px-4 py-3 sm:py-4 text-left transition cursor-pointer ${card.hoverBorder}`}
                style={
                  isSel
                    ? {
                        borderColor: cfg.primary,
                        boxShadow: `0 0 26px ${cfg.glow}, inset 0 1px 0 rgba(255,248,235,0.18)`,
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-base sm:text-lg text-amber-50">
                    {card.label}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${card.dotColor}`} />
                </div>
                <p className={`text-xs font-semibold ${card.subColor} mt-0.5`}>{card.name}</p>
                <p className="text-[11px] text-amber-100/70 mt-1 hidden sm:block">{card.tagline}</p>
              </button>
            );
          })}
        </div>

        {/* Primary Gradient Pill CTA */}
        <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
          <button
            id="btn-to-modes"
            type="button"
            onClick={onToModes}
            className={`rounded-full px-8 py-3.5 font-semibold text-sm sm:text-base text-slate-950 bg-gradient-to-r shadow-[0_12px_32px_rgba(250,204,21,0.35)] hover:scale-[1.03] active:scale-[0.98] transition cursor-pointer ${cfg.ctaClasses}`}
          >
            Start Playing →
          </button>
          {onOpenMultiplayer && (
            <button
              id="btn-lobby-multiplayer"
              type="button"
              onClick={onOpenMultiplayer}
              className="twilight-pill rounded-full px-6 py-3.5 font-semibold text-sm sm:text-base text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
            >
              Multiplayer
            </button>
          )}
          {onOpenLeaderboards && (
            <button
              id="btn-lobby-leaderboards"
              type="button"
              onClick={onOpenLeaderboards}
              className="twilight-pill rounded-full px-5 py-3.5 font-semibold text-sm sm:text-base text-amber-100 hover:border-amber-200/40 transition cursor-pointer"
            >
              Leaderboards
            </button>
          )}
        </div>

        {/* Conditional Resume Chapter Prompt */}
        {savedCheckpoint && (
          <div
            id="resume-chapter-banner"
            className="twilight-glass rounded-full px-4 py-2 flex flex-wrap items-center justify-center gap-2.5 text-xs text-amber-100"
          >
            <span className="font-medium">
              Saved: {DIFFICULTY_CONFIGS[savedCheckpoint.soloState.difficulty].name} • Chapter{' '}
              {savedCheckpoint.soloState.chapter} ({savedCheckpoint.soloState.wordIndex + 1}/
              {WORDS_PER_CHAPTER})
            </span>
            <button
              id="btn-resume-chapter"
              type="button"
              onClick={onResumeCheckpoint}
              className="rounded-full px-3.5 py-1 font-semibold text-slate-950 bg-amber-300 hover:bg-amber-200 transition cursor-pointer"
            >
              Resume chapter
            </button>
            <button
              id="btn-abandon-checkpoint"
              type="button"
              onClick={onAbandonCheckpoint}
              className="twilight-pill rounded-full px-3 py-1 font-semibold text-rose-200 hover:border-rose-300/40 transition cursor-pointer"
            >
              Abandon
            </button>
          </div>
        )}

        {/* Compact Profile Pill */}
        <div
          id="lobby-profile-pill"
          className="twilight-pill rounded-full px-4 py-1.5 text-xs font-medium text-amber-100/85 tabular-nums"
        >
          Level {account ? account.profile.level : saveData.profile.level} • {cfg.name} Best{' '}
          {diffStats.highScore} • Streak {diffStats.bestStreak}
        </div>

        {!account && (
          <p id="guest-storage-notice" className="text-[11px] text-amber-100/65">
            Guest progress is stored on this device
          </p>
        )}

        {account && saveData.profile.xp > 0 && !account.profile.imported && onOpenGuestImport && (
          <button
            id="btn-lobby-import-prompt"
            type="button"
            onClick={onOpenGuestImport}
            className="twilight-pill rounded-full px-3.5 py-1 text-xs font-semibold text-amber-200 hover:border-amber-200/40 transition cursor-pointer"
          >
            Import device progress ({saveData.profile.xp} XP)
          </button>
        )}
      </div>

      {/* Step 2: Wayfaring Mode Selection View */}
      <div
        id="mode-select-view"
        className={`my-auto mx-auto w-full max-w-xl twilight-glass rounded-[2rem] p-5 sm:p-7 flex-col gap-5 ${
          step === 'MODE_SELECT' ? 'flex' : 'hidden'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            id="btn-back-lobby"
            type="button"
            onClick={onBackToLobby}
            className="twilight-pill rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold text-amber-100 hover:border-amber-200/40 transition cursor-pointer"
          >
            ← Lobby
          </button>
          <div
            id="mode-stage-badge"
            className="twilight-pill rounded-full px-3.5 py-1.5 flex items-center gap-2 text-xs font-semibold text-amber-50"
          >
            <span id="mode-stage-dot" className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
            <span id="mode-stage-label">
              {cfg.label} • {cfg.name}
            </span>
          </div>
        </div>

        <div className="text-center sm:text-left">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-amber-50">
            Choose Your Wayfaring Style
          </h2>
          <p id="mode-stage-summary" className="text-xs sm:text-sm text-amber-100/80 mt-1">
            {cfg.summary}
          </p>
        </div>

        <div id="mode-selector" className="flex flex-col gap-2.5">
          {MODE_CARDS.map((card) => {
            const isSel = card.key === selectedMode;
            return (
              <button
                key={card.key}
                type="button"
                data-mode={card.key}
                onClick={() => onSelectMode(card.key)}
                className="mode-card twilight-pill rounded-3xl p-4 text-left transition cursor-pointer hover:border-amber-200/40"
                style={
                  isSel
                    ? {
                        borderColor: cfg.primary,
                        boxShadow: `0 0 22px ${cfg.glow}`,
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-base sm:text-lg text-amber-50">
                    {card.title}
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${card.badgeClasses}`}
                  >
                    {card.badge}
                  </span>
                </div>
                <p className="text-xs text-amber-100/75 mt-1">{card.desc}</p>
              </button>
            );
          })}
        </div>

        <button
          id="btn-begin-journey"
          type="button"
          onClick={onBeginJourney}
          className={`w-full rounded-full py-3.5 font-semibold text-sm sm:text-base text-slate-950 bg-gradient-to-r shadow-[0_12px_30px_rgba(250,204,21,0.3)] hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer ${cfg.ctaClasses}`}
        >
          Begin Journey
        </button>
      </div>

      <div className="h-4" />
    </div>
  );
}
