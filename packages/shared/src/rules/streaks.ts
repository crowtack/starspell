import { BASE_GLOW_RADIUS_PX } from './params.js';

export interface StreakMilestone {
  readonly streak: number;
  readonly label: string;
  readonly glow: string;
  readonly glowRadiusPx: number;
  readonly mult: number;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { streak: 3, label: 'STREAK ×3', glow: '28px', glowRadiusPx: 28, mult: 1.25 },
  { streak: 5, label: 'COMBO ×5', glow: '34px', glowRadiusPx: 34, mult: 1.5 },
  { streak: 8, label: 'OVERDRIVE', glow: '40px', glowRadiusPx: 40, mult: 2.0 },
  { streak: 12, label: 'UNSTOPPABLE', glow: '46px', glowRadiusPx: 46, mult: 2.5 },
  { streak: 20, label: 'LEGENDARY', glow: '54px', glowRadiusPx: 54, mult: 3.0 },
];

export function getStreakMilestone(streak: number): StreakMilestone | null {
  let active: StreakMilestone | null = null;
  for (const milestone of STREAK_MILESTONES) {
    if (streak >= milestone.streak) {
      active = milestone;
    }
  }
  return active;
}

export function getExactStreakMilestone(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.streak === streak) ?? null;
}

export function getStreakMultiplier(streak: number): number {
  return getStreakMilestone(streak)?.mult ?? 1.0;
}

export function getStreakGlow(streak: number): string {
  return getStreakMilestone(streak)?.glow ?? `${String(BASE_GLOW_RADIUS_PX)}px`;
}
