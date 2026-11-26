import {
  DIFFICULTY_CONFIGS,
  SUN_RING_CIRCUMFERENCE,
  type DifficultyKey,
  type SyncStatus,
} from '@starspell/shared';
import { SyncStatusBadge } from './SyncStatusBadge';

export interface TopHudProps {
  visible: boolean;
  difficulty: DifficultyKey;
  chapter: number;
  timeLeft: number;
  maxClock: number;
  streak: number;
  level: number;
  score: number;
  muted: boolean;
  syncStatus?: SyncStatus | null;
  onRetrySync?: () => void;
  onHomeClick: () => void;
  onToggleMute: () => void;
  onOpenSettings: () => void;
}

export function TopHud({
  visible,
  difficulty,
  chapter,
  timeLeft,
  maxClock,
  streak,
  level,
  score,
  muted,
  syncStatus = null,
  onRetrySync,
  onHomeClick,
  onToggleMute,
  onOpenSettings,
}: TopHudProps) {
  const cfg = DIFFICULTY_CONFIGS[difficulty];
  const ratio = Math.min(1, Math.max(0, timeLeft / Math.max(1, maxClock)));
  const offset = SUN_RING_CIRCUMFERENCE * (1 - ratio);
  const ringStroke = timeLeft < 5.0 ? '#fb7185' : timeLeft < 15.0 ? '#fbbf24' : cfg.primary;

  return (
    <header
      id="top-hud"
      className={`fixed top-0 left-0 right-0 z-20 px-3 sm:px-6 pt-3 sm:pt-4 flex items-center justify-between gap-2 transition-opacity duration-500 ${
        visible ? '' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Left Cluster */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          id="btn-hud-home"
          type="button"
          onClick={onHomeClick}
          className="twilight-pill rounded-full px-3.5 py-2 flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
          title="Return to Lobby"
        >
          <span
            className="w-4 h-4 rounded-full inline-flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle, #fef08a 0%, #fb923c 100%)',
              boxShadow: '0 0 10px rgba(250,204,21,0.6)',
            }}
          />
          <span className="font-display font-bold tracking-tight">Starspell</span>
        </button>
        <div
          id="hud-stage-pill"
          className="twilight-pill rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-amber-50/90"
        >
          <span id="hud-stage-dot" className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
          <span id="hud-stage-name">{cfg.name}</span>
        </div>
        <div
          id="hud-chapter-pill"
          className="twilight-pill rounded-full px-3 py-1.5 text-xs font-semibold text-amber-100/85 tabular-nums"
        >
          Chapter {chapter}
        </div>
        {syncStatus && <SyncStatusBadge status={syncStatus} onRetry={onRetrySync} />}
      </div>

      {/* Center Circular Sun-Ring SVG Countdown Timer */}
      <div className="relative w-[56px] h-[56px] flex items-center justify-center shrink-0">
        <svg
          className="w-[56px] h-[56px] -rotate-90 drop-shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
          viewBox="0 0 56 56"
        >
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="rgba(20, 12, 22, 0.58)"
            stroke="rgba(255, 243, 214, 0.16)"
            strokeWidth="3.5"
          />
          <circle
            id="sun-ring-progress"
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke="var(--stage-ring)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="144.51"
            strokeDashoffset={offset.toFixed(2)}
            style={{ transition: 'stroke 0.3s ease', stroke: ringStroke }}
          />
        </svg>
        <span
          id="hud-timer-text"
          className="absolute font-display font-bold text-lg text-amber-50 tabular-nums"
        >
          {Math.max(0, Math.ceil(timeLeft))}
        </span>
      </div>

      {/* Right Cluster */}
      <div className="flex items-center gap-2">
        <div
          id="hud-streak-pill"
          className="twilight-pill rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-200 tabular-nums"
        >
          <span>☀</span>
          <span id="hud-streak-val">{streak}</span>
        </div>
        <div
          id="hud-score-pill"
          className="twilight-pill rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-amber-50 tabular-nums hidden sm:flex items-center gap-1.5"
        >
          <span id="hud-level-val">Lvl {level}</span>
          <span className="opacity-40">•</span>
          <span id="hud-score-val">{score.toLocaleString()}</span>
        </div>
        <button
          id="btn-hud-mute"
          type="button"
          onClick={onToggleMute}
          className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
          aria-label="Toggle Sound"
        >
          <svg
            id="icon-sound-on"
            className={`w-4 h-4 ${muted ? 'hidden' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          <svg
            id="icon-sound-off"
            className={`w-4 h-4 ${muted ? '' : 'hidden'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        </button>
        <button
          id="btn-hud-settings"
          type="button"
          onClick={onOpenSettings}
          className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-50 hover:border-amber-200/40 transition cursor-pointer"
          aria-label="Open Settings"
        >
          <svg
            className="w-4 h-4"
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
        </button>
      </div>
    </header>
  );
}
