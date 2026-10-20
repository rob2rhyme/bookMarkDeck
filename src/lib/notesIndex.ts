// What the shared shell needs from Notes, without importing the Notes feature
// (which would make `rm -rf src/features/notes` break the palette). It owns the
// notes cache key — useNotes imports it, so the two can never drift — plus a
// read-only summary of the cached notes for ⌘K, and the "new note" handoff,
// mirroring filingIntent.ts.

export const NOTES_CACHE_BASE = "bookmarkdeck:notes:v1";
export const notesCacheKey = (email?: string | null) => (email ? `${NOTES_CACHE_BASE}:${email}` : NOTES_CACHE_BASE);

export type NoteSummary = {
  id: string;
  title: string;
  /** First readable line of the body ("" for a locked note). */
  preview: string;
  /** Text the palette matches against: title, tags and the start of the body. */
  keywords: string;
  locked: boolean;
};

/** Enough body for search to be useful without matching against megabytes. */
const BODY_KEYWORDS = 2_000;

/**
 * One line of markdown as it reads. Deliberately rough — the Notes feature has
 * the real parser (lib/markdown.ts); this only has to make a palette row
 * readable and searchable.
 */
export function plainLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+•]\s+|\d+[.)]\s+)/, "")
    .replace(/^\[( |x|X)\]\s*/, (_m, c: string) => (c === " " ? "☐ " : "☑ "))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .trim();
}

/** The signed-in account's cached notes, pinned first then most recent. Never another account's. */
export function readNoteSummaries(email: string | null | undefined): NoteSummary[] {
  if (typeof window === "undefined" || !email) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(notesCacheKey(email)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n) => n && typeof n.id === "string")
      .sort((a, b) =>
        a.pinned === b.pinned ? String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")) : a.pinned ? -1 : 1
      )
      .map((n): NoteSummary => {
        const locked = Boolean(n.lock);
        const body = locked || typeof n.body !== "string" ? "" : n.body;
        const lines = body.split("\n").map(plainLine).filter(Boolean);
        const rawTitle = typeof n.title === "string" ? n.title.trim() : "";
        const title = rawTitle || (locked ? "Locked note" : lines.shift() ?? "Untitled");
        const tags = Array.isArray(n.tags) ? n.tags.filter((t: unknown) => typeof t === "string") : [];
        return {
          id: n.id,
          title,
          preview: lines[0] ?? "",
          keywords: [title, ...tags.map((t: string) => `#${t}`), lines.join(" ").slice(0, BODY_KEYWORDS)].join(" "),
          locked,
        };
      });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------- new-note intent --- */

const NEW_NOTE_KEY = "bd:intent:new-note";
/** Fired after routing, so an already-mounted Notes list reacts (as filingIntent's nudge). */
export const NEW_NOTE_NUDGE = "bd:intent:new-note:nudge";

export function setNewNoteIntent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NEW_NOTE_KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(NEW_NOTE_NUDGE));
}

/** Read and clear, so a stale intent can't fire twice. */
export function consumeNewNoteIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const set = window.localStorage.getItem(NEW_NOTE_KEY) === "1";
    if (set) window.localStorage.removeItem(NEW_NOTE_KEY);
    return set;
  } catch {
    return false;
  }
}
