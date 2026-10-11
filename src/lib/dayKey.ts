// Local-day keys, shared. Every day key in the app is a LOCAL `YYYY-MM-DD` —
// never a UTC date, which puts a US evening on tomorrow and an Asia-Pacific
// morning on yesterday. Pure and dependency-free, so the shared shell can import
// it without pulling anything else into its bundle.
//
// This is the only formatter: habits' lib/day.ts re-exports dayKeyFor/todayKey
// beside its day arithmetic, and src/lib/dayKeyFormatters.test.ts fails on any
// other hand-built day key — or on an import added here.

export function dayKeyFor(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local YYYY-MM-DD for "today" — call in an effect or handler, never during render. */
export function todayKey(): string {
  return dayKeyFor(new Date());
}

const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The local day a stored date or instant falls on, or null if it isn't one.
 *
 * A bare `YYYY-MM-DD` already IS a day and is returned as-is: `new Date()` would
 * read it as UTC midnight, which local getters then put on the previous day
 * everywhere west of UTC (an all-day event on the 29th landed on the 28th).
 * Anything else is an instant, mapped to the day it is here.
 */
export function dayKeyOf(value: string): string | null {
  if (BARE_DAY.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dayKeyFor(d);
}
