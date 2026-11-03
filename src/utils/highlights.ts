// Highlights on a bookmark: passages the reader marked, kept as plain text. The
// page is never stored — a highlight is found again in the page by its text — so
// a bookmark carries only a few hundred characters of the reader's own picks.
//
// They ride the bookmark record (local cache, cloud, backups), so they are capped:
// bookmarks live in one Firestore document with a 1 MiB limit. Pure — see
// highlights.test.ts.

import type { BookmarkHighlight } from "@/types/bookmark";

export const MAX_HIGHLIGHTS = 30; // per bookmark
export const MAX_HIGHLIGHT_CHARS = 600; // per highlight
export const MIN_HIGHLIGHT_CHARS = 3;

/** Whitespace collapsed, trimmed, capped — the form a highlight is stored and matched in. */
export function cleanHighlightText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_HIGHLIGHT_CHARS ? flat.slice(0, MAX_HIGHLIGHT_CHARS).trimEnd() : flat;
}

/** What a stored or imported value really is: valid highlights, or undefined for none. */
export function cleanHighlights(raw: unknown): BookmarkHighlight[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: BookmarkHighlight[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.text !== "string") continue;
    const text = cleanHighlightText(r.text);
    if (text.length < MIN_HIGHLIGHT_CHARS || seen.has(text)) continue;
    seen.add(text);
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : crypto.randomUUID(),
      text,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    });
    if (out.length >= MAX_HIGHLIGHTS) break;
  }
  return out.length ? out : undefined;
}

export type AddResult =
  | { ok: true; highlights: BookmarkHighlight[]; added: BookmarkHighlight }
  | { ok: false; reason: "too_short" | "duplicate" | "full" };

/** Add a passage, newest last. Refuses a too-short, repeated, or over-limit one. */
export function addHighlight(
  list: BookmarkHighlight[] | undefined,
  text: string,
  now = new Date().toISOString(),
  id = crypto.randomUUID()
): AddResult {
  const clean = cleanHighlightText(text);
  if (clean.length < MIN_HIGHLIGHT_CHARS) return { ok: false, reason: "too_short" };
  const current = list ?? [];
  if (current.some((h) => h.text === clean)) return { ok: false, reason: "duplicate" };
  if (current.length >= MAX_HIGHLIGHTS) return { ok: false, reason: "full" };
  const added: BookmarkHighlight = { id, text: clean, createdAt: now };
  return { ok: true, highlights: [...current, added], added };
}

export function removeHighlight(
  list: BookmarkHighlight[] | undefined,
  id: string
): BookmarkHighlight[] | undefined {
  const next = (list ?? []).filter((h) => h.id !== id);
  return next.length ? next : undefined;
}
