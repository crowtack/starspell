import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  DIFFICULTY_CONFIGS,
  WORDS_PER_CHAPTER,
  type DifficultyKey,
  type WordRecord,
} from '@starspell/shared';

export interface MilestoneToast {
  readonly id: number;
  readonly text: string;
}

export interface GameplayArenaProps {
  visible: boolean;
  difficulty: DifficultyKey;
  wordIndex: number;
  currentWord: WordRecord | null;
  typedLetters: readonly string[];
  glimpseMode: 'STARLIGHT' | 'FLASH' | null;
  isVerifying: boolean;
  verifiedCount: number;
  isSpeaking: boolean;
  milestones: readonly MilestoneToast[];
  flashedKey: string | null;
  onPronounce: () => void;
  onSkip: () => void;
  onVirtualKey: (key: string) => void;
}

interface LineCoords {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
}

const KEYBOARD_ROWS: ReadonlyArray<readonly string[]> = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
];

export function GameplayArena({
  visible,
  difficulty,
  wordIndex,
  currentWord,
  typedLetters,
  glimpseMode,
  isVerifying,
  verifiedCount,
  isSpeaking,
  milestones,
  flashedKey,
  onPronounce,
  onSkip,
  onVirtualKey,
}: GameplayArenaProps) {
  const cfg = DIFFICULTY_CONFIGS[difficulty];
  const target = currentWord ? currentWord.word.toUpperCase() : '';
  const wordSlotsRef = useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = useState<LineCoords[]>([]);

  const measureLines = useCallback(() => {
    const container = wordSlotsRef.current;
    if (!container || !currentWord || glimpseMode !== null) {
      setLines([]);
      return;
    }
    const wrapperRect = container.getBoundingClientRect();
    if (wrapperRect.width === 0) {
      setLines([]);
      return;
    }
    const tiles = Array.from(container.children) as HTMLElement[];
    const nextLines: LineCoords[] = [];
    for (let i = 0; i < tiles.length - 1; i++) {
      const c1 = typedLetters[i];
      const c2 = typedLetters[i + 1];
      if (c1 && c2 && c1 === target[i] && c2 === target[i + 1]) {
        const t1 = tiles[i];
        const t2 = tiles[i + 1];
        if (!t1 || !t2) continue;
        const r1 = t1.getBoundingClientRect();
        const r2 = t2.getBoundingClientRect();
        nextLines.push({
          x1: (r1.left - wrapperRect.left + r1.width / 2).toFixed(1),
          y1: (r1.top - wrapperRect.top + r1.height / 2).toFixed(1),
          x2: (r2.left - wrapperRect.left + r2.width / 2).toFixed(1),
          y2: (r2.top - wrapperRect.top + r2.height / 2).toFixed(1),
        });
      }
    }
    setLines(nextLines);
  }, [currentWord, glimpseMode, target, typedLetters]);

  useLayoutEffect(() => {
    const rafId = requestAnimationFrame(measureLines);
    const container = wordSlotsRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        requestAnimationFrame(measureLines);
      });
      observer.observe(container);
    }
    const handleResize = () => {
      requestAnimationFrame(measureLines);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [measureLines]);

  const showTypoHint =
    !glimpseMode &&
    target.length > 0 &&
    typedLetters.length === target.length &&
    typedLetters.join('') !== target;

  return (
    <>
      {/* Milestone Floating Banner */}
      <div id="milestone-layer" className="fixed top-20 left-1/2 z-40 pointer-events-none">
        {milestones.map((m) => (
          <div
            key={m.id}
            className="milestone-toast twilight-pill rounded-full px-5 py-2 font-display font-bold text-sm sm:text-base tracking-wide text-amber-100 border-amber-300/45 shadow-[0_0_24px_var(--stage-glow)] whitespace-nowrap"
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Active Gameplay Arena */}
      <main
        id="gameplay-arena"
        className={`fixed inset-0 z-10 flex flex-col items-center justify-between pt-20 sm:pt-24 pb-4 sm:pb-6 px-3 transition-opacity duration-500 ${
          visible ? '' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Upper Sky Progress Pearls */}
        <div
          id="constellation-nodes"
          className="twilight-pill rounded-full px-4 py-2 flex items-center gap-2 sm:gap-2.5"
        >
          {Array.from({ length: WORDS_PER_CHAPTER }, (_, i) => {
            const stateClass =
              i < wordIndex ? 'pearl-done' : i === wordIndex ? 'pearl-current' : '';
            return <span key={i} className={`lantern-pearl ${stateClass}`} />;
          })}
        </div>

        {/* Center Clue & Lantern Medallion Stage */}
        <section
          id="constellation-stage"
          className="w-full max-w-4xl flex flex-col items-center justify-center gap-4 sm:gap-5 my-auto px-2"
        >
          {/* Action Pills Row */}
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button
              id="btn-pronounce"
              type="button"
              onClick={onPronounce}
              className={`twilight-pill rounded-full px-4 py-2 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-amber-50 hover:border-amber-200/40 transition cursor-pointer ${
                isSpeaking ? 'is-speaking' : ''
              }`}
            >
              <svg
                className="w-4 h-4 opacity-90"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span>Listen</span>
              <span id="listen-waves" className="flex items-center gap-0.5 h-4 text-amber-200">
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </span>
            </button>

            <div
              id="glimpse-badge"
              className={`twilight-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-amber-200 border-amber-300/40 ${
                glimpseMode ? '' : 'hidden'
              }`}
            >
              {glimpseMode === 'STARLIGHT' ? 'Opening Lantern' : 'Sunbeam Glimpse'}
            </div>

            <button
              id="btn-skip"
              type="button"
              onClick={onSkip}
              className="twilight-pill rounded-full px-4 py-2 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-100/80 hover:text-amber-50 hover:border-amber-200/35 transition cursor-pointer"
            >
              <span>Skip</span>
              <span id="skip-penalty-label" className="opacity-70 text-xs tabular-nums">
                -{cfg.skipPenalty.toFixed(1)}s
              </span>
            </button>
          </div>

          {/* Frameless Storybook Definition */}
          <p
            id="clue-definition"
            className="font-display text-center text-lg sm:text-2xl md:text-[1.7rem] leading-snug text-amber-50 max-w-2xl px-3 drop-shadow-[0_3px_14px_rgba(12,6,14,0.85)]"
          >
            {currentWord ? currentWord.definition : ''}
          </p>

          {/* Circular Lantern Letter Medallions + Constellation SVG */}
          <div className="relative w-full flex items-center justify-center py-2">
            <div
              id="word-slots-wrapper"
              className="relative inline-flex items-center justify-center"
            >
              <svg
                id="constellation-svg"
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                style={{ zIndex: 1 }}
              >
                {lines.map((line, idx) => (
                  <line
                    key={idx}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    className="constellation-line"
                  />
                ))}
              </svg>
              <div
                id="word-slots"
                ref={wordSlotsRef}
                className="relative flex flex-wrap items-center justify-center gap-2 sm:gap-3"
                style={{ zIndex: 2 }}
              >
                {Array.from({ length: target.length }, (_, i) => {
                  const isGlimpsed =
                    (glimpseMode === 'STARLIGHT' && i === 0) || glimpseMode === 'FLASH';
                  const ch = typedLetters[i];
                  let text = '';
                  let stateClass = '';

                  if (isVerifying && i < verifiedCount) {
                    text = ch ?? target[i] ?? '';
                    stateClass = 'tile-verified';
                  } else if (isGlimpsed) {
                    text = target[i] ?? '';
                    stateClass = 'tile-glimpse';
                  } else if (ch) {
                    text = ch;
                    stateClass = ch === target[i] ? 'tile-correct' : 'tile-error';
                  } else if (i === typedLetters.length && !isVerifying) {
                    stateClass = 'tile-active';
                  }

                  return (
                    <div key={i} className={`star-tile ${stateClass}`}>
                      {text}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Gentle Typo Hint */}
          <p
            id="typo-hint"
            className="h-5 text-xs sm:text-sm font-medium text-rose-200/95 transition-opacity duration-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
            style={{ opacity: showTypoHint ? 1 : 0 }}
          >
            Tap ⌫ to fix a highlighted letter
          </p>
        </section>

        {/* Bottom Floating 3-Row Pill Keyboard */}
        <nav
          id="celestial-keyboard"
          className="w-full max-w-2xl flex flex-col items-center gap-1.5 sm:gap-2 pb-1"
          aria-label="On-screen Keyboard"
        >
          {KEYBOARD_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center justify-center gap-1 sm:gap-1.5 w-full">
              {row.map((key) => {
                const isWide = key === 'BACK' || key === 'ENTER';
                const label = key === 'BACK' ? '⌫' : key === 'ENTER' ? '↵' : key;
                const isPressed = flashedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    data-key={key}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onVirtualKey(key);
                    }}
                    className={`celestial-key ${isWide ? 'key-wide' : ''} ${
                      isPressed ? 'key-pressed' : ''
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </main>
    </>
  );
}
