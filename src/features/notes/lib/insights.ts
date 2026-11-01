// What your notes say about themselves. Pure: everything is derived from the
// notes (and their histories) and the deletion log at the moment it's asked;
// nothing here is stored. Locked notes count toward totals, but their words
// can't be counted — the text isn't readable here, and that is the point.

import { editCount, type NoteEvent } from "@/features/notes/lib/activity";
import type { DeletedEntry } from "@/features/notes/lib/deletionLog";
import { toPlainText } from "@/features/notes/lib/markdown";
import type { Note } from "@/features/notes/lib/notes";
import { tagCounts, type TagCount } from "@/features/notes/lib/tags";
import { dayKeyFor } from "@/lib/dayKey";

export const WEEKS = 12;
export const STALE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Words after markdown syntax is dropped. toPlainText keeps list structure as
 * glyphs ("• four", "☐ milk"), so a "word" must hold a letter or digit.
 */
export const wordCount = (body: string): number =>
  toPlainText(body)
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Local midnight of the Monday on or before `d`. */
export function weekStart(d: Date): Date {
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

export type WeekBucket = { start: string; created: number; edits: number };

export type NoteRank = { id: string; title: string; value: number };

export type FeedItem = {
  at: string;
  noteId: string;
  title: string;
  /** Event label source: a note's own event, or the account log's "deleted". */
  event: NoteEvent | { kind: "deleted"; at: string };
  /** For a deletion: whether the note exists again (the delete was undone). */
  restored?: boolean;
};

export type NotesInsights = {
  total: number;
  pinned: number;
  locked: number;
  untagged: number;
  words: number;
  /** Unlocked notes only — the words of locked ones aren't readable here. */
  averageWords: number;
  weeks: WeekBucket[];
  tags: TagCount[];
  mostEdited: NoteRank[];
  longest: NoteRank[];
  stale: NoteRank[];
  deletedLast30: number;
  feed: FeedItem[];
};

const titleOf = (n: Pick<Note, "title" | "body" | "lock">): string =>
  n.title.trim() ||
  (n.lock ? "Locked note" : toPlainText(n.body).split("\n").find((l) => l.trim())?.trim().slice(0, 80)) ||
  "Untitled";

/**
 * A note's history as shown: its recorded events, plus a "created" taken from
 * createdAt for a note older than history-keeping (nothing else is invented).
 */
export function historyOf(note: Note): NoteEvent[] {
  const events = note.activity ?? [];
  if (events.some((e) => e.kind === "created")) return events;
  return [{ at: note.createdAt, kind: "created" }, ...events];
}

export function computeInsights(
  notes: Note[],
  deletions: DeletedEntry[],
  now: Date = new Date(),
  feedSize = 50
): NotesInsights {
  const unlocked = notes.filter((n) => !n.lock);
  const words = new Map(unlocked.map((n) => [n.id, wordCount(n.body)]));
  const totalWords = [...words.values()].reduce((a, b) => a + b, 0);

  // Twelve local weeks, oldest first, ending with the current one.
  const thisWeek = weekStart(now);
  const starts = Array.from({ length: WEEKS }, (_, i) =>
    dayKeyFor(new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7 * (WEEKS - 1 - i)))
  );
  const index = new Map(starts.map((s, i) => [s, i]));
  const weeks: WeekBucket[] = starts.map((start) => ({ start, created: 0, edits: 0 }));
  const bucket = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? undefined : index.get(dayKeyFor(weekStart(d)));
  };

  const edits = new Map<string, number>();
  const feed: FeedItem[] = [];
  for (const n of notes) {
    const c = bucket(n.createdAt);
    if (c !== undefined) weeks[c].created++;
    let total = 0;
    for (const e of historyOf(n)) {
      const k = editCount(e);
      total += k;
      const b = bucket(e.at);
      if (k && b !== undefined) weeks[b].edits += k;
      feed.push({ at: e.at, noteId: n.id, title: titleOf(n), event: e });
    }
    if (total) edits.set(n.id, total);
  }

  const live = new Set(notes.map((n) => n.id));
  for (const d of deletions) {
    feed.push({
      at: d.at,
      noteId: d.id,
      title: d.title || "Untitled",
      event: { kind: "deleted", at: d.at },
      restored: live.has(d.id),
    });
  }
  feed.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const rank = (pairs: [Note, number][], size = 5): NoteRank[] =>
    pairs
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1] || titleOf(a[0]).localeCompare(titleOf(b[0])))
      .slice(0, size)
      .map(([n, value]) => ({ id: n.id, title: titleOf(n), value }));

  const staleCutoff = now.getTime() - STALE_DAYS * DAY_MS;
  const stale = notes
    .filter((n) => Date.parse(n.updatedAt) < staleCutoff)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
    .map((n) => ({ id: n.id, title: titleOf(n), value: Math.floor((now.getTime() - Date.parse(n.updatedAt)) / DAY_MS) }));

  const monthAgo = now.getTime() - 30 * DAY_MS;

  return {
    total: notes.length,
    pinned: notes.filter((n) => n.pinned).length,
    locked: notes.length - unlocked.length,
    untagged: notes.filter((n) => n.tags.length === 0).length,
    words: totalWords,
    averageWords: unlocked.length ? Math.round(totalWords / unlocked.length) : 0,
    weeks,
    tags: tagCounts(notes).slice(0, 8),
    mostEdited: rank(notes.map((n) => [n, edits.get(n.id) ?? 0])),
    longest: rank(unlocked.map((n) => [n, words.get(n.id) ?? 0])),
    stale,
    deletedLast30: deletions.filter((d) => Date.parse(d.at) >= monthAgo).length,
    feed: feed.slice(0, feedSize),
  };
}
