// "Rediscover what you own" — pick one item worth a second look, to nudge
// conscious ownership (use it, or let it go). Deterministic per day so it's a
// calm daily surface, not a slot machine that reshuffles on every render. Pure —
// see rediscover.test.ts.

import type { InventoryItem } from "@/features/inventory/lib/types";

/** Stable hash of a YYYY-MM-DD day → non-negative int (rotates the pick daily). */
function dayHash(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * One item to resurface for `day`, favouring the least-recently-touched
 * ("forgotten") items — or null when the catalog is too small to bother with
 * (< 5 active items). Deterministic: the same day always picks the same item,
 * and it changes day to day.
 */
export function pickRediscover(
  items: InventoryItem[],
  day: string,
  minItems = 5,
  poolSize = 20
): InventoryItem | null {
  if (!day) return null;
  const active = items.filter((i) => !i.archived);
  if (active.length < minItems) return null;
  // Oldest-touched first; stable tiebreak by id so the sort is deterministic.
  const pool = [...active]
    .sort(
      (a, b) =>
        (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") ||
        a.id.localeCompare(b.id)
    )
    .slice(0, poolSize);
  return pool[dayHash(day) % pool.length] ?? null;
}
