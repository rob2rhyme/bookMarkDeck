// Pure search helpers for the inventory pillar: the "do I already own this?"
// duplicate guard, the bookmark-picker filter, and the "Where is it?" retrieval
// find. No React/Firebase — see inventorySearch.test.ts.

import type {
  InventoryItem,
  InventoryLocation,
  ItemLink,
} from "@/lib/types";

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

// ── "Where is it?" retrieval ────────────────────────────────────────────────

/**
 * For every location, its full root→leaf breadcrumb of names,
 * e.g. `["Bedroom", "Closet", "Top shelf"]`. Missing parents stop the walk;
 * a cycle (shouldn't happen — removeLocation reparents orphans) is broken
 * defensively so we never loop.
 */
export function locationPathsById(
  locations: InventoryLocation[]
): Record<string, string[]> {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const cache: Record<string, string[]> = {};
  const build = (id: string, seen: Set<string>): string[] => {
    if (cache[id]) return cache[id];
    const loc = byId.get(id);
    if (!loc) return [];
    if (seen.has(id)) return [loc.name]; // cycle guard
    seen.add(id);
    const path = [...(loc.parentId ? build(loc.parentId, seen) : []), loc.name];
    cache[id] = path;
    return path;
  };
  const result: Record<string, string[]> = {};
  for (const l of locations) result[l.id] = build(l.id, new Set());
  return result;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asSubsequence = (needle: string, hay: string): boolean => {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
};

/**
 * Forgiving relevance score of a query against one field. Higher is better,
 * 0 means no match. Ranges (exact → prefix → word-start → substring →
 * all-tokens → some-tokens → fuzzy subsequence) so typos and word-order slips
 * still surface the right thing.
 */
function fieldScore(hay: string, q: string, qTokens: string[]): number {
  if (!hay) return 0;
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 85;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(hay)) return 70;
  if (hay.includes(q)) return 55;
  if (qTokens.length > 0 && qTokens.every((t) => hay.includes(t))) return 45;
  const hits = qTokens.filter((t) => hay.includes(t)).length;
  if (hits > 0) return 20 + hits * 8;
  if (asSubsequence(q.replace(/\s+/g, ""), hay.replace(/\s+/g, ""))) return 15;
  return 0;
}

/**
 * Strip the natural-language wrapper people type into a "where is it?" box —
 * "where's my …", "find the …", a trailing "?" — leaving the thing itself.
 */
export function cleanWhereQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\?+$/, "")
    .replace(/^(where(?:'s| is| are)?|find|locate)\s+/i, "")
    .replace(/^(is|are)\s+/i, "")
    .replace(/^(my|the|our|a|an)\s+/i, "")
    .trim();
}

export type WhereResult = {
  item: InventoryItem;
  /** Root→leaf location breadcrumb; empty when the item has no location. */
  path: string[];
  score: number;
};

/**
 * "Where is it?" retrieval: forgiving fuzzy find over active items, ranked, each
 * carrying its resolved location breadcrumb so the caller can lead with *where*
 * the thing is. Name matches outrank secondary fields (category, maker, model,
 * serial, tags). Archived items are skipped — you're looking for what you keep.
 */
export function whereIs(
  items: InventoryItem[],
  locations: InventoryLocation[],
  query: string,
  limit = 8
): WhereResult[] {
  const q = cleanWhereQuery(query);
  if (q.length < 2) return [];
  const qTokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const paths = locationPathsById(locations);

  const scored: WhereResult[] = [];
  for (const item of items) {
    if (item.archived) continue;
    let score = fieldScore(item.name.trim().toLowerCase(), q, qTokens);
    const secondary = [
      item.category,
      item.manufacturer,
      item.model,
      item.serial,
      item.tags.join(" "),
    ];
    for (const f of secondary) {
      if (!f) continue;
      score = Math.max(score, fieldScore(f.toLowerCase(), q, qTokens) * 0.5);
    }
    if (score <= 0) continue;
    scored.push({
      item,
      path: item.locationId ? paths[item.locationId] ?? [] : [],
      score,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}
