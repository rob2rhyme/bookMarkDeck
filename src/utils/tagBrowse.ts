// Browse bookmarks by tag: every tag with how many bookmarks carry it, most used
// first, and the test the tag filter applies. Case-insensitive ("Work" and "work"
// are one tag) and shown the way it was first written. Pure — see tagBrowse.test.ts.

import type { Bookmark } from "@/types/bookmark";

export type TagCount = { key: string; label: string; count: number };

/** The comparison form of a tag. */
export const tagKey = (tag: string): string => tag.trim().toLowerCase();

export function countTags(bookmarks: Pick<Bookmark, "tags">[]): TagCount[] {
  const byKey = new Map<string, TagCount>();
  for (const b of bookmarks) {
    // A bookmark that repeats a tag ("Work", "work") counts once for it.
    const own = new Set<string>();
    for (const raw of b.tags ?? []) {
      const key = tagKey(raw);
      if (!key || own.has(key)) continue;
      own.add(key);
      const hit = byKey.get(key);
      if (hit) hit.count++;
      else byKey.set(key, { key, label: raw.trim(), count: 1 });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

/** Does this bookmark carry the tag (an empty filter matches everything)? */
export function hasTag(bookmark: Pick<Bookmark, "tags">, key: string): boolean {
  if (!key) return true;
  return (bookmark.tags ?? []).some((t) => tagKey(t) === key);
}
