// A note's history: what happened to it and when — never what it said.
//
// Events ride on the note itself (Note.activity), so they sync, cache and back up
// exactly as the note does, and a deleted note takes its history with it (the
// account-level deletion log, lib/deletionLog.ts, records that it went). Like
// filing's activity timelines, the list is capped, so the oldest events of a
// long-lived note age out: this is recent history, not a ledger.
//
// No event carries note text. Tags appear because tags are already plaintext
// (locked notes included); titles never do — the note's current title is enough.

export type NoteEventKind =
  | "created"
  | "edited"
  | "pinned"
  | "unpinned"
  | "tagged"
  | "locked"
  | "unlocked"
  | "restored"
  | "imported";

export type NoteEvent = {
  /** ISO instant. For a coalesced "edited", the LAST edit in the run. */
  at: string;
  kind: NoteEventKind;
  /** "edited" only: how many saves this entry stands for. */
  n?: number;
  /** "edited" only: when the run began. */
  from?: string;
  /** "tagged" only. */
  added?: string[];
  removed?: string[];
};

/** Per note. Coalescing keeps a heavily edited note far below this. */
export const MAX_NOTE_EVENTS = 100;

/**
 * Autosave writes every 800 ms of typing, so each save can't be its own event.
 * Saves less than this apart extend the current "edited" entry instead.
 */
export const EDIT_SESSION_MS = 30 * 60 * 1000;

export const EVENT_LABELS: Record<NoteEventKind, string> = {
  created: "Created",
  edited: "Edited",
  pinned: "Pinned",
  unpinned: "Unpinned",
  tagged: "Tags changed",
  locked: "Locked",
  unlocked: "Unlocked",
  restored: "Restored",
  imported: "Restored from a backup",
};

const KINDS = new Set<string>(Object.keys(EVENT_LABELS));
const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 20) : undefined;

/** Coerce a stored history (cache, cloud, backup) into valid events, oldest first, capped. */
export function normalizeActivity(raw: unknown): NoteEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteEvent[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    if (typeof e.kind !== "string" || !KINDS.has(e.kind) || !isIso(e.at)) continue;
    const ev: NoteEvent = { at: e.at, kind: e.kind as NoteEventKind };
    if (ev.kind === "edited") {
      if (typeof e.n === "number" && Number.isInteger(e.n) && e.n > 1) ev.n = e.n;
      if (isIso(e.from)) ev.from = e.from;
    }
    if (ev.kind === "tagged") {
      const added = strings(e.added);
      const removed = strings(e.removed);
      if (added?.length) ev.added = added;
      if (removed?.length) ev.removed = removed;
    }
    out.push(ev);
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out.slice(-MAX_NOTE_EVENTS);
}

/**
 * Add an event. An edit within EDIT_SESSION_MS of the previous edit — with
 * nothing else in between — extends that entry rather than adding one.
 */
export function appendEvent(history: NoteEvent[] | undefined, event: NoteEvent): NoteEvent[] {
  const list = history ?? [];
  const last = list[list.length - 1];
  if (
    event.kind === "edited" &&
    last?.kind === "edited" &&
    Date.parse(event.at) - Date.parse(last.at) < EDIT_SESSION_MS
  ) {
    const merged: NoteEvent = { ...last, at: event.at, n: (last.n ?? 1) + 1, from: last.from ?? last.at };
    return [...list.slice(0, -1), merged];
  }
  return [...list, event].slice(-MAX_NOTE_EVENTS);
}

/** Tags added and removed between two canonical tag lists. */
export function tagDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  return {
    added: after.filter((t) => !before.includes(t)),
    removed: before.filter((t) => !after.includes(t)),
  };
}

/** How many saves an entry stands for (1 for anything but a coalesced edit). */
export const editCount = (e: NoteEvent): number => (e.kind === "edited" ? (e.n ?? 1) : 0);

/** One line describing an event, for the history list. */
export function describeEvent(e: NoteEvent): string {
  if (e.kind === "edited" && e.n && e.n > 1) return `Edited (${e.n} saves)`;
  if (e.kind === "tagged") {
    const parts = [
      e.added?.length ? `added ${e.added.map((t) => `#${t}`).join(" ")}` : "",
      e.removed?.length ? `removed ${e.removed.map((t) => `#${t}`).join(" ")}` : "",
    ].filter(Boolean);
    return parts.length ? `Tags ${parts.join(", ")}` : EVENT_LABELS.tagged;
  }
  return EVENT_LABELS[e.kind];
}
