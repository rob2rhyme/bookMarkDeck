// Read later: a bookmark can be put in a queue to be read in the reader view, and
// marked read when done. The state is two timestamps on the bookmark — when it was
// queued and when it was finished — so there is no separate list to drift from
// the bookmarks: the queue is derived, oldest first, so nothing sits forgotten
// behind newer arrivals. Pure — see readLater.test.ts.

import { dayKeyOf } from "@/lib/dayKey";
import type { Bookmark } from "@/types/bookmark";

type State = Pick<Bookmark, "readLaterAt" | "readAt">;

/** In the queue and not yet finished. */
export const isQueued = (b: State): boolean => Boolean(b.readLaterAt) && !b.readAt;

/** Finished — whether or not it was ever queued. */
export const isRead = (b: State): boolean => Boolean(b.readAt);

/** The queue, oldest-queued first (ties by id, so the order is stable). */
export function readingQueue<T extends State & { id: string }>(bookmarks: T[]): T[] {
  return bookmarks
    .filter(isQueued)
    .sort((a, b) => (a.readLaterAt ?? "").localeCompare(b.readLaterAt ?? "") || a.id.localeCompare(b.id));
}

/** Patches for `updateBookmark`. `undefined` clears a field. */
export const queuePatch = (now = new Date().toISOString()): State => ({ readLaterAt: now, readAt: undefined });
export const readPatch = (now = new Date().toISOString()): State => ({ readAt: now });
export const dequeuePatch = (): State => ({ readLaterAt: undefined, readAt: undefined });

/** Whole calendar days from `a` to `b` (bare local days): label arithmetic, no instant. */
function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** "today", "yesterday", "5 days", "3 weeks", "4 months" — how long it has waited, by local days. */
export function waitingLabel(queuedAt: string, now: Date = new Date()): string {
  const from = dayKeyOf(queuedAt);
  const to = dayKeyOf(now.toISOString());
  if (!from || !to) return "";
  const days = Math.max(0, daysBetween(from, to));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
}

const validInstant = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() && !Number.isNaN(new Date(v).getTime()) ? v : undefined;

/** What stored or imported values really are: valid instants, or absent. */
export function cleanReadLater(raw: { readLaterAt?: unknown; readAt?: unknown }): State {
  const out: State = {};
  const q = validInstant(raw.readLaterAt);
  const r = validInstant(raw.readAt);
  if (q) out.readLaterAt = q;
  if (r) out.readAt = r;
  return out;
}
