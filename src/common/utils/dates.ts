import { env } from '../../config/env';

const OFFSET_MS = env.TIMEZONE_OFFSET_MINUTES * 60 * 1000;

/**
 * Day boundaries for a local (IST by default) calendar date.
 * Reports for Indian vendors must roll over at local midnight, not UTC midnight.
 */
export function localDayRange(dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(base.getTime())) {
    throw new Error('Invalid date');
  }
  const local = new Date(base.getTime() + (dateStr ? 0 : OFFSET_MS));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** "YYYY-MM-DD" for a Date, in local (IST) time. */
export function localDateKey(date: Date): string {
  const local = new Date(date.getTime() + OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

/** Local hour of day (0-23) for a Date. */
export function localHour(date: Date): number {
  const local = new Date(date.getTime() + OFFSET_MS);
  return local.getUTCHours();
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
