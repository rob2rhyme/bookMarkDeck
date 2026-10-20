// The one event a note's own history can't hold: that the note was deleted.
//
// Kept per account, newest MAX_DELETIONS entries, in the device cache and in one
// Firestore document (users/{uid}/notesMeta/log). Entries are only ever ADDED and
// the two copies merge as a union: an undone delete stays listed (the note's own
// history then reads "Restored"), because removing entries would let one
// device's older copy bring them back anyway. A title is recorded — titles are
// plaintext already, locked notes included — never a body.

export type DeletedEntry = { id: string; title: string; at: string };

export const MAX_DELETIONS = 100;

const BASE = "bookmarkdeck:notes:deleted:v1";
export const deletionLogKey = (email?: string | null) => (email ? `${BASE}:${email}` : BASE);

const keyOf = (e: DeletedEntry) => `${e.id}@${e.at}`;

export function normalizeDeletions(raw: unknown): DeletedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DeletedEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) continue;
    if (typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) continue;
    out.push({ id: e.id, title: typeof e.title === "string" ? e.title.slice(0, 200) : "", at: e.at });
  }
  return out;
}

/** Union by (id, instant), newest first, capped. */
export function mergeDeletions(...lists: DeletedEntry[][]): DeletedEntry[] {
  const byKey = new Map<string, DeletedEntry>();
  for (const list of lists) for (const e of list) byKey.set(keyOf(e), e);
  return [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX_DELETIONS);
}

/** True when `a` holds an entry `b` lacks — i.e. the cloud needs this device's copy. */
export function hasEntriesMissingFrom(a: DeletedEntry[], b: DeletedEntry[]): boolean {
  const have = new Set(b.map(keyOf));
  return a.some((e) => !have.has(keyOf(e)));
}

export function readDeletions(email: string | null | undefined): DeletedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeDeletions(JSON.parse(window.localStorage.getItem(deletionLogKey(email)) ?? "[]"));
  } catch {
    return [];
  }
}

export const DELETIONS_CHANGED = "bd:notes-deletions-changed";

export function writeDeletions(email: string | null | undefined, list: DeletedEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(deletionLogKey(email), JSON.stringify(list));
  } catch {
    /* storage full or blocked: the cloud copy, if any, still has it */
  }
  window.dispatchEvent(new Event(DELETIONS_CHANGED));
}
