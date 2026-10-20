// Tag rules for Notes. Pure — no React, no Firebase.
//
// A tag is stored in ONE canonical form so "#Work", "work " and "WORK" are the
// same tag everywhere: lowercase, no leading "#", whitespace runs become "-",
// and only letters, digits, "-", "_" and "/" survive ("/" so "work/clients"
// can read as a sub-tag later). Canonical-on-write means the list's filter,
// search's "#tag" and the counts never have to agree on a fold at read time.

export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS_PER_NOTE = 20;

export function normalizeTag(raw: string): string | null {
  const t = raw
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_/-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, MAX_TAG_LENGTH)
    .replace(/[-/]+$/, "");
  return t ? t : null;
}

/** Canonicalise, drop invalid, de-duplicate (first wins), cap the count. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const t = normalizeTag(r);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === MAX_TAGS_PER_NOTE) break;
  }
  return out;
}

export type TagCount = { tag: string; count: number };

/** Every tag in use, most-used first, then alphabetical. */
export function tagCounts(notes: { tags: string[] }[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Suggestions while typing a tag: existing tags not already on the note, those
 * that START with what was typed first, then those that merely contain it,
 * each group in most-used order. An empty prefix offers the most-used tags.
 */
export function suggestTags(all: TagCount[], typed: string, exclude: string[], limit = 6): string[] {
  const q = normalizeTag(typed) ?? "";
  const pool = all.filter((c) => !exclude.includes(c.tag));
  if (!q) return pool.slice(0, limit).map((c) => c.tag);
  const starts = pool.filter((c) => c.tag.startsWith(q));
  const contains = pool.filter((c) => !c.tag.startsWith(q) && c.tag.includes(q));
  return [...starts, ...contains].slice(0, limit).map((c) => c.tag);
}

/** `tags` with `from` replaced by `to` (merging if `to` is already there). Unchanged array when `from` is absent. */
export function renameIn(tags: string[], from: string, to: string): string[] {
  if (!tags.includes(from)) return tags;
  return normalizeTags(tags.map((t) => (t === from ? to : t)));
}
