// Pure helpers for the Notes pillar — no React, no Firebase.

import { normalizeActivity, type NoteEvent } from "@/features/notes/lib/activity";
import { toPlainText } from "@/features/notes/lib/markdown";
import { normalizeTags } from "@/features/notes/lib/tags";
import { normalizeLock, type NoteLock } from "@/features/notes/lib/vault";

export type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  /** Canonical tags (lib/tags.ts): lowercase, no "#", de-duplicated. */
  tags: string[];
  /** ISO instants. Kept as strings locally; Firestore Timestamps in the cloud. */
  createdAt: string;
  updatedAt: string;
  /**
   * Present on a LOCKED note: its body, encrypted (lib/vault.ts). A locked note's
   * `body` is always "" — the plaintext exists only in an unlocked editor's memory.
   */
  lock?: NoteLock;
  /** What happened to the note and when, never what it said (lib/activity.ts). */
  activity?: NoteEvent[];
};

/**
 * Firestore caps a document at 1 MiB. A UTF-16 code unit is at most 3 bytes of
 * UTF-8, so this many characters always fits with room for the other fields.
 */
export const MAX_NOTE_CHARS = 300_000;

const isoOr = (v: unknown, fallback: string): string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback;

/**
 * Coerce anything (a cache entry, a hand-edited document) into a Note, or null
 * when it has no usable id. A bad record must never crash the list render.
 */
export function normalizeNote(raw: unknown): Note | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.trim()) return null;
  const epoch = new Date(0).toISOString();
  const createdAt = isoOr(r.createdAt, epoch);
  const lock = normalizeLock(r.lock);
  const activity = normalizeActivity(r.activity);
  return {
    id: r.id,
    title: typeof r.title === "string" ? r.title : "",
    // A locked note never carries plaintext, whatever the record says.
    body: !lock && typeof r.body === "string" ? r.body : "",
    pinned: r.pinned === true,
    tags: normalizeTags(r.tags),
    createdAt,
    updatedAt: isoOr(r.updatedAt, createdAt),
    ...(lock ? { lock } : {}),
    ...(activity.length ? { activity } : {}),
  };
}

export function newNote(
  init: Partial<Pick<Note, "title" | "body">> = {},
  now: Date = new Date()
): Note {
  const iso = now.toISOString();
  return {
    id: crypto.randomUUID(),
    title: init.title ?? "",
    body: init.body ?? "",
    pinned: false,
    tags: [],
    createdAt: iso,
    updatedAt: iso,
    activity: [{ at: iso, kind: "created" }],
  };
}

/** Pinned first, then most recently edited. Ties fall back to newest-created, then id, so the order is total. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export const isBlank = (n: Pick<Note, "title" | "body">) =>
  n.title.trim() === "" && n.body.trim() === "";

const nonEmptyLines = (text: string) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/**
 * What a card shows: the title and the body's first line. An untitled note
 * (pasted text, say) is titled by its own first line instead of "Untitled", and
 * then previews the line after it, so the card never repeats itself.
 */
export function cardText(n: Pick<Note, "title" | "body" | "lock">): { title: string; preview: string } {
  // A locked note shows only its title — the body is ciphertext.
  if (n.lock) return { title: n.title.trim() || "Locked note", preview: "" };
  // Markdown syntax is dropped: a card reads "☐ buy milk", not "- [ ] **buy** milk".
  const lines = nonEmptyLines(toPlainText(n.body));
  const title = n.title.trim();
  if (title) return { title, preview: lines[0] ?? "" };
  if (lines.length) return { title: lines[0], preview: lines[1] ?? "" };
  return { title: "Untitled", preview: "" };
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function editedAgo(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(then);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
