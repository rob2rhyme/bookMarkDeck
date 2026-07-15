// Pure analysis over an item's activity log — possession time, lending history,
// and the counts the Trending panel ranks on. No React/Firebase, no clock reads
// (callers pass `nowMs`), so it's deterministic and unit-tested (activity.test.ts).
// Events are appended by the hook/form; this file only reads them.

import type {
  InventoryItem,
  ItemActivity,
  ItemActivityType,
} from "@/features/inventory/lib/types";

const DAY_MS = 86_400_000;

/** Parse an ISO timestamp (or YYYY-MM-DD) to epoch ms; null when unusable. */
export function toMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Activity oldest-first (a stable copy). */
export function sortedActivity(item: InventoryItem): ItemActivity[] {
  return [...(item.activity ?? [])].sort(
    (a, b) => (toMs(a.at) ?? 0) - (toMs(b.at) ?? 0)
  );
}

/** When the item entered your care: an "acquired" event, else purchase date,
 *  else the item's createdAt. Epoch ms, or null if none are known. */
export function acquiredMs(item: InventoryItem): number | null {
  const acq = (item.activity ?? []).find((a) => a.type === "acquired");
  return (
    toMs(acq?.at) ?? toMs(item.purchaseDate) ?? toMs(item.createdAt) ?? null
  );
}

/** Whole days the item has been in your possession, up to `nowMs`. null if the
 *  start is unknown. Never negative. */
export function possessionDays(item: InventoryItem, nowMs: number): number | null {
  const start = acquiredMs(item);
  if (start === null) return null;
  return Math.max(0, Math.floor((nowMs - start) / DAY_MS));
}

/** Count of events of a type, optionally only since `sinceMs`. */
export function countType(
  item: InventoryItem,
  type: ItemActivityType,
  sinceMs = 0
): number {
  return (item.activity ?? []).filter(
    (a) => a.type === type && (toMs(a.at) ?? 0) >= sinceMs
  ).length;
}

/** ISO timestamp of the most recent event of a type, or null. */
export function lastOf(
  item: InventoryItem,
  type: ItemActivityType
): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const a of item.activity ?? []) {
    if (a.type !== type) continue;
    const ms = toMs(a.at) ?? -Infinity;
    if (ms > bestMs) {
      bestMs = ms;
      best = a.at;
    }
  }
  return best;
}

export type LoanRecord = {
  to?: string;
  lentAt: string;
  returnedAt: string | null; // null = still out
  days: number | null; // whole days out (to return, or to nowMs if open)
  conditionOut?: string;
  conditionIn?: string;
};

/**
 * Pair "lent" events with their "returned" events into loan records, in the
 * order they were lent. An unreturned loan has returnedAt null and its duration
 * measured to `nowMs`.
 */
export function lendingHistory(
  item: InventoryItem,
  nowMs: number
): LoanRecord[] {
  const events = sortedActivity(item);
  const loans: LoanRecord[] = [];
  let open: LoanRecord | null = null;
  for (const e of events) {
    if (e.type === "lent") {
      if (open) loans.push(open); // a new loan without a return closes the last as open
      open = {
        to: e.to,
        lentAt: e.at,
        returnedAt: null,
        days: null,
        conditionOut: e.condition,
      };
    } else if (e.type === "returned" && open) {
      open.returnedAt = e.at;
      open.conditionIn = e.condition;
      const s = toMs(open.lentAt);
      const en = toMs(e.at);
      open.days = s !== null && en !== null ? Math.max(0, Math.floor((en - s) / DAY_MS)) : null;
      loans.push(open);
      open = null;
    }
  }
  if (open) {
    const s = toMs(open.lentAt);
    open.days = s !== null ? Math.max(0, Math.floor((nowMs - s) / DAY_MS)) : null;
    loans.push(open);
  }
  return loans.reverse(); // most recent first
}

export type ActivitySummary = {
  possessionDays: number | null;
  uses: number;
  lastUsed: string | null;
  lends: number;
  relocations: number;
  currentLoan: LoanRecord | null; // an open (unreturned) loan, if any
};

/** Everything the detail view's history header needs, in one pass. */
export function activitySummary(
  item: InventoryItem,
  nowMs: number
): ActivitySummary {
  const loans = lendingHistory(item, nowMs);
  return {
    possessionDays: possessionDays(item, nowMs),
    uses: countType(item, "used"),
    lastUsed: lastOf(item, "used"),
    lends: countType(item, "lent"),
    relocations: countType(item, "relocated"),
    currentLoan: loans.find((l) => l.returnedAt === null) ?? null,
  };
}

export type TrendingEntry = { item: InventoryItem; count: number };

export type Trending = {
  used: TrendingEntry[];
  lent: TrendingEntry[];
  relocated: TrendingEntry[];
};

/**
 * Items ranked by recent activity within `windowDays` of `nowMs`. Each list is
 * sorted by count desc, keeps only items with at least one such event, and is
 * capped at `limit`. Archived items are excluded.
 */
export function trending(
  items: InventoryItem[],
  nowMs: number,
  windowDays = 90,
  limit = 5
): Trending {
  const since = nowMs - windowDays * DAY_MS;
  const rank = (type: ItemActivityType): TrendingEntry[] =>
    items
      .filter((i) => !i.archived)
      .map((item) => ({ item, count: countType(item, type, since) }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  return {
    used: rank("used"),
    lent: rank("lent"),
    relocated: rank("relocated"),
  };
}

/** True when there's anything to show in the Trending panel. */
export function hasTrending(t: Trending): boolean {
  return t.used.length > 0 || t.lent.length > 0 || t.relocated.length > 0;
}
