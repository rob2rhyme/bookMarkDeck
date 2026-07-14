// Pure search helpers for the inventory pillar: the "do I already own this?"
// duplicate guard and the bookmark-picker filter. No React/Firebase — see
// inventorySearch.test.ts.

import type { InventoryItem, ItemLink } from "@/features/inventory/lib/types";

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

/**
 * Items that look like what the user is about to add — a gentle
 * "you may already own this" nudge, not a blocker. Matches on substring
 * containment either way, or any shared word of 3+ letters. Archived items
 * still count (you own them even if you stopped tracking them actively).
 */
export function similarItems(
  items: InventoryItem[],
  name: string,
  limit = 3
): InventoryItem[] {
  const q = name.trim().toLowerCase();
  if (q.length < 3) return [];
  const qTokens = new Set(tokenize(q));
  return items
    .filter((i) => {
      const n = i.name.trim().toLowerCase();
      if (!n) return false;
      if (n.includes(q) || q.includes(n)) return true;
      return tokenize(n).some((t) => qTokens.has(t));
    })
    .slice(0, limit);
}

/** Case-insensitive title/url filter for the bookmark picker, capped. */
export function filterBookmarks(
  bookmarks: ItemLink[],
  query: string,
  limit = 6
): ItemLink[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return bookmarks
    .filter(
      (b) =>
        b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    )
    .slice(0, limit);
}
