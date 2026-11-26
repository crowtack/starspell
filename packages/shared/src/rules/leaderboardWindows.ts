export type LeaderboardWindow = 'all' | 'weekly' | 'monthly';

/**
 * Returns the start of the current ISO week (Monday 00:00:00.000 UTC).
 */
export function getWeeklyWindowStartUtc(now: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

/**
 * Returns the start of the current calendar month in UTC (1st 00:00:00.000 UTC).
 */
export function getMonthlyWindowStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function getWindowStartUtc(
  timeframe: LeaderboardWindow,
  now: Date = new Date(),
): Date | null {
  if (timeframe === 'all') return null;
  if (timeframe === 'weekly') return getWeeklyWindowStartUtc(now);
  return getMonthlyWindowStartUtc(now);
}

export function getNextWindowResetUtc(
  timeframe: LeaderboardWindow,
  now: Date = new Date(),
): Date | null {
  if (timeframe === 'all') return null;
  if (timeframe === 'weekly') {
    const start = getWeeklyWindowStartUtc(now);
    return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}
