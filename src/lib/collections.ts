// Pure helpers for kits & collections — a named set an item belongs to (its
// `collection` label), distinct from a physical location or a bookmark folder.
// Think "camera-bag kit" or "vinyl collection". No React/Firebase; see
// collections.test.ts.

import type { InventoryItem } from "@/lib/types";
import { itemValue } from "@/lib/value";

export type CollectionGroup = {
  name: string;
  items: InventoryItem[];
  count: number;
  totalValue: number;
};

/** Distinct collection names across active items, sorted, case-insensitively
 *  de-duped (first spelling wins) — for the picker datalist. */
export function collectionNames(items: InventoryItem[]): string[] {
  const byLower = new Map<string, string>();
  for (const i of items) {
    if (i.archived) continue;
    const name = i.collection?.trim();
    if (name && !byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Active items grouped by collection, each with its item count and total value,
 * biggest collection first. Items without a collection are omitted. Members are
 * ordered by value (highest first) so the kit's marquee piece leads.
 */
export function collectionGroups(items: InventoryItem[]): CollectionGroup[] {
  const map = new Map<string, CollectionGroup>();
  for (const i of items) {
    if (i.archived) continue;
    const name = i.collection?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const g = map.get(key) ?? { name, items: [], count: 0, totalValue: 0 };
    g.items.push(i);
    g.count += 1;
    g.totalValue += itemValue(i);
    map.set(key, g);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => itemValue(b) - itemValue(a) || a.name.localeCompare(b.name));
  }
  return [...map.values()].sort(
    (a, b) => b.totalValue - a.totalValue || b.count - a.count || a.name.localeCompare(b.name)
  );
}
