// The focus hydration cache: today's water count on this device, shared by the
// two pillars that show it — Focus writes it as you drink; habits reads it and
// mirrors into it for a linked water habit. Each used to spell it by hand, and
// the copies drifted (habits ignored the day it was given and the legacy
// field), so the key, the shape and the day rules live here, in a neutral lib
// both may import — the same arrangement as bookmarkFocusLink.ts.
//
// The record is keyed by a LOCAL day key. Before that it carried only a
// toDateString stamp ("Sun Oct 11 2026"). That stamp is still read, so a count
// saved before the upgrade doesn't reset, and still written beside the day key,
// so a tab running the previous bundle reads our record instead of zeroing it.
// Only today's count is ever cached: a write for any other day is dropped.

import { todayKey } from "@/lib/dayKey";

const KEY = "bookmarkdeck:focus:hydration:v1";

type Stored = {
  day?: unknown;
  date?: unknown;
  cups?: unknown;
  glasses?: unknown;
  lastDrink?: unknown;
};

export type HydrationCache = { cups: number; lastDrink: number | null };

export function hydrationCacheKey(email?: string | null): string {
  return email ? `${KEY}:${email}` : KEY;
}

/** The pre-day-key stamp for `day`, built from its parts. Never parsed: how
 *  Date.parse reads that format is implementation-defined. */
function legacyStamp(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toDateString();
}

function load(email?: string | null): Stored | null {
  try {
    const raw = window.localStorage.getItem(hydrationCacheKey(email));
    const rec: unknown = raw ? JSON.parse(raw) : null;
    return rec && typeof rec === "object" ? (rec as Stored) : null;
  } catch {
    return null;
  }
}

/** The cached count for `day`, or null when the cache holds another day (or nothing). */
export function readHydrationCache(
  email: string | null | undefined,
  day: string
): HydrationCache | null {
  if (typeof window === "undefined") return null;
  const rec = load(email);
  if (!rec) return null;
  const isFor = typeof rec.day === "string" ? rec.day === day : rec.date === legacyStamp(day);
  if (!isFor) return null;
  // `glasses` is the count's name in the oldest records.
  const count =
    typeof rec.cups === "number" ? rec.cups : typeof rec.glasses === "number" ? rec.glasses : 0;
  return {
    cups: Math.max(0, Math.round(count)),
    lastDrink: typeof rec.lastDrink === "number" ? rec.lastDrink : null,
  };
}

/**
 * Cache `cups` as `day`'s count. Dropped (returns false) unless `day` is today:
 * a writer still on yesterday — a habits tab that hasn't noticed midnight —
 * would otherwise put yesterday's count in today's record.
 *
 * `lastDrink` drives Focus's reminder clock. Omitted, it moves to now only when
 * the count rises; lowering or clearing the count is not a drink.
 */
export function writeHydrationCache(
  email: string | null | undefined,
  day: string,
  cups: number,
  lastDrink?: number
): boolean {
  if (typeof window === "undefined" || day !== todayKey()) return false;
  const count = Math.max(0, Math.round(cups));
  let drank = lastDrink;
  if (drank === undefined) {
    const prev = readHydrationCache(email, day);
    drank = count > (prev?.cups ?? 0) ? Date.now() : (prev?.lastDrink ?? Date.now());
  }
  try {
    window.localStorage.setItem(
      hydrationCacheKey(email),
      JSON.stringify({ day, date: legacyStamp(day), cups: count, lastDrink: drank })
    );
    return true;
  } catch {
    return false;
  }
}
