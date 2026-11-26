import type { WordTier } from '../data/wordBank.js';

export type DifficultyKey = 'EASY' | 'INTERMEDIATE' | 'HARD';

export interface DifficultyConfig {
  readonly key: DifficultyKey;
  readonly label: string;
  readonly name: string;
  readonly ambientLabel: string;
  readonly description: string;
  readonly summary: string;
  readonly envIndex: number;
  readonly initialClock: number;
  readonly solveBonus: number;
  readonly skipPenalty: number;
  readonly xpMultiplier: number;
  readonly tierCurve: readonly WordTier[];
  readonly primary: string;
  readonly secondary: string;
  readonly glow: string;
  readonly ctaClasses: string;
  readonly dotClass: string;
  readonly bpm: number;
}

export const DIFFICULTY_KEYS: readonly DifficultyKey[] = ['EASY', 'INTERMEDIATE', 'HARD'];

export const DIFFICULTY_CONFIGS: Readonly<Record<DifficultyKey, DifficultyConfig>> = {
  EASY: {
    key: 'EASY',
    label: 'Easy',
    name: 'Sunset Breeze',
    ambientLabel: 'Sunset Breeze',
    description:
      'Breathe in the warm golden canyon air and weave lantern words across the ridge before dusk settles.',
    summary: '45.0s clock • Gentle alpine vocabulary • Warm golden canyon',
    envIndex: 0.0,
    initialClock: 45.0,
    solveBonus: 3.2,
    skipPenalty: 3.0,
    xpMultiplier: 1.0,
    tierCurve: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5],
    primary: '#facc15',
    secondary: '#fb923c',
    glow: 'rgba(250, 204, 21, 0.55)',
    ctaClasses: 'from-yellow-300 via-amber-400 to-rose-400',
    dotClass: 'bg-yellow-300',
    bpm: 96,
  },
  INTERMEDIATE: {
    key: 'INTERMEDIATE',
    label: 'Intermediate',
    name: 'Twilight Journey',
    ambientLabel: 'Twilight Breeze',
    description:
      'Follow glowing fireflies beneath a crescent moon as starlight awakens the high canyon observatory.',
    summary: '42.0s clock • Richer literary vocabulary • Moonlit indigo canyon',
    envIndex: 1.0,
    initialClock: 42.0,
    solveBonus: 2.8,
    skipPenalty: 3.5,
    xpMultiplier: 1.3,
    tierCurve: [2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5],
    primary: '#818cf8',
    secondary: '#c084fc',
    glow: 'rgba(129, 140, 248, 0.58)',
    ctaClasses: 'from-sky-300 via-indigo-400 to-purple-500',
    dotClass: 'bg-indigo-400',
    bpm: 106,
  },
  HARD: {
    key: 'HARD',
    label: 'Hard',
    name: 'Eclipse of the Summit',
    ambientLabel: 'Eclipse Wind',
    description:
      'Stand fast above molten fissures as storm lightning splits the crimson corona over the summit.',
    summary: '38.0s clock • Master orthographic challenges • Crimson lunar eclipse',
    envIndex: 2.0,
    initialClock: 38.0,
    solveBonus: 2.4,
    skipPenalty: 4.0,
    xpMultiplier: 1.65,
    tierCurve: [3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5],
    primary: '#fb7185',
    secondary: '#f97316',
    glow: 'rgba(251, 113, 133, 0.58)',
    ctaClasses: 'from-amber-400 via-orange-500 to-rose-500',
    dotClass: 'bg-rose-400',
    bpm: 118,
  },
};

export function isDifficultyKey(value: unknown): value is DifficultyKey {
  return value === 'EASY' || value === 'INTERMEDIATE' || value === 'HARD';
}
