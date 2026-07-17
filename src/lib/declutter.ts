// Pure declutter helpers for the inventory pillar: the "keep / donate / sell"
// pile and the daily "let go" signal that a habit can auto-track. Derived from
// fields on the item (disposition / releasedDate) — no new store. No
// React/Firebase; see declutter.test.ts.

import type {
  InventoryItem,
  ItemDisposition,
} from "@/lib/types";
import { itemValue } from "@/lib/value";

// Order the pile surfaces sections in.
const RANK: Record<ItemDisposition, number> = {
  sell: 0,
  donate: 1,
  giveaway: 2,
  trash: 3,
};

/**
 * The active "on the way out" pile — items tagged with a disposition that
 * haven't been released yet, most-actionable first (sell → donate → give away →
 * toss, then by name). Archived/released items have left the catalog.
 */
export function declutterItems(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((i) => !i.archived && i.disposition)
    .sort(
      (a, b) =>
        RANK[a.disposition!] - RANK[b.disposition!] ||
        a.name.localeCompare(b.name)
    );
}

export type DeclutterSummary = {
  count: number;
  byDisposition: Record<ItemDisposition, number>;
  /** Estimated recoup from the items tagged "sell" (item value × quantity). */
  sellValue: number;
};

/** Roll-up of the pile for the header badge + the modal's sell-value line. */
export function declutterSummary(items: InventoryItem[]): DeclutterSummary {
  const byDisposition: Record<ItemDisposition, number> = {
    sell: 0,
    donate: 0,
    giveaway: 0,
    trash: 0,
  };
  let count = 0;
  let sellValue = 0;
  for (const i of declutterItems(items)) {
    byDisposition[i.disposition!] += 1;
    count += 1;
    if (i.disposition === "sell") sellValue += itemValue(i);
  }
  return { count, byDisposition, sellValue };
}

/** How many items were let go on `day` — the signal a declutter habit tracks. */
export function releasedOn(items: InventoryItem[], day: string): number {
  if (!day) return 0;
  return items.reduce((n, i) => (i.releasedDate === day ? n + 1 : n), 0);
}
