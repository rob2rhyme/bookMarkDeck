// src/features/habits/lib/day.ts
//
// Local-day helpers. Day keys are local `YYYY-MM-DD` strings (never UTC — that
// mis-buckets evening logs) and arithmetic goes through Date objects built at
// local midday so DST 23/25h days never skip or double-count.

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayKeyFor(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local YYYY-MM-DD for "today" — call inside an effect, never during render. */
export function todayKey(): string {
  return dayKeyFor(new Date());
}

/** Parse a day key to a local Date at midday (DST-safe for day arithmetic). */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Shift a day key by n days (n may be negative). */
export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKeyFor(d);
}

/** 0=Sun … 6=Sat for a day key. */
export function weekdayOf(key: string): number {
  return parseDay(key).getDay();
}

/** The Sunday-anchored week key (the Sunday's day key) for a given day. */
export function weekKeyOf(key: string): string {
  return addDays(key, -weekdayOf(key));
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
