import { describe, expect, it } from 'vitest';
import {
  getMonthlyWindowStartUtc,
  getNextWindowResetUtc,
  getWeeklyWindowStartUtc,
} from './leaderboardWindows.js';

describe('leaderboard UTC window boundaries (GAME_RULES §12.8)', () => {
  it('weekly window starts Monday 00:00 UTC and resets next Monday 00:00 UTC', () => {
    const sundayLate = new Date('2026-03-08T23:59:59.999Z'); // Sunday
    expect(getWeeklyWindowStartUtc(sundayLate).toISOString()).toBe('2026-03-02T00:00:00.000Z');
    expect(getNextWindowResetUtc('weekly', sundayLate)?.toISOString()).toBe(
      '2026-03-09T00:00:00.000Z',
    );

    const mondayExact = new Date('2026-03-09T00:00:00.000Z');
    expect(getWeeklyWindowStartUtc(mondayExact).toISOString()).toBe('2026-03-09T00:00:00.000Z');
    expect(getNextWindowResetUtc('weekly', mondayExact)?.toISOString()).toBe(
      '2026-03-16T00:00:00.000Z',
    );
  });

  it('monthly window starts 1st 00:00 UTC and resets next 1st 00:00 UTC', () => {
    const monthEnd = new Date('2026-01-31T23:59:59.999Z');
    expect(getMonthlyWindowStartUtc(monthEnd).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(getNextWindowResetUtc('monthly', monthEnd)?.toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );

    const monthStart = new Date('2026-02-01T00:00:00.000Z');
    expect(getMonthlyWindowStartUtc(monthStart).toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});
