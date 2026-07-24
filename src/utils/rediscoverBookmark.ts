// "Rediscover" — resurface one stale-but-once-loved bookmark to nudge you back
// to something you saved and forgot. Deterministic per day (a calm daily surface,
// not a reshuffle on every render), favouring least-recently-opened links.
// Pure — see rediscoverBookmark.test.ts.

import type { Bookmark } from "@/types/bookmark";

/** Stable hash of a YYYY-MM-DD day → non-negative int (rotates the pick daily). */
function dayHash(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return h;
}

/** Staleness ranking timestamp: last opened, else created. */
function touchedAt(b: Bookmark): string {
  return b.lastUsedAt ?? b.createdAt ?? "";
}

/**
 * One bookmark to resurface for `day`, favouring "once-loved" links (opened at
 * least once) that are the least-recently opened. Returns null for a small
 * library (< minLibrary) so it never nags a near-empty deck. Deterministic: the
 * same day always picks the same bookmark, and it rotates day to day.
 */
export function pickRediscoverBookmark(
  bookmarks: Bookmark[],
  day: string,
  minLibrary = 8,
  poolSize = 15
): Bookmark | null {
  if (!day) return null;
  if (bookmarks.length < minLibrary) return null;

  const loved = bookmarks.filter((b) => (b.hits ?? 0) > 0);
  const candidates = loved.length >= 3 ? loved : bookmarks;

  // Oldest-touched first (forgotten), stable tiebreak by id.
  const pool = [...candidates]
    .sort(
      (a, b) =>
        touchedAt(a).localeCompare(touchedAt(b)) || a.id.localeCompare(b.id)
    )
    .slice(0, poolSize);

  if (pool.length === 0) return null;
  return pool[dayHash(day) % pool.length] ?? null;
}
