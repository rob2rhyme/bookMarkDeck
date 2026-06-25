// Shared focus types, framework-free so hooks and the data layer can import
// them without cycles.

import type { MoodKey } from "@/features/focus/lib/mood";

export type FocusTask = {
  id: string;
  text: string;
  done: boolean;
  /** ISO timestamp of the last focus block attributed to this task. */
  lastUsedAt?: string | null;
};

export type FocusSessionRecord = {
  id: string; // Firestore doc id (for deletion / restore)
  focusMin: number;
  day: string; // YYYY-MM-DD
  taskId: string | null;
  createdAt: string | null; // ISO timestamp of completion (for the timeline)
};

export type JournalEntry = {
  day: string; // YYYY-MM-DD (also the doc id)
  note: string; // legacy single note (pre multi-note); kept for migration
  mood: MoodKey | null;
};

export type JournalNoteKind = "note" | "dream";

/** Optional structured attributes for a dream entry (all device-agnostic, synced). */
export type DreamDetails = {
  tags?: string[]; // freeform themes: people, places, motifs
  lucid?: boolean; // aware it was a dream
  vividness?: number; // 1..5
  nightmare?: boolean;
};

export type JournalNote = {
  id: string;
  day: string; // YYYY-MM-DD
  text: string;
  createdAt: string | null; // ISO timestamp (null for migrated legacy notes)
  kind?: JournalNoteKind; // default "note"; "dream" = dream-log entry
} & DreamDetails;

/** Validate/normalize raw dream fields from storage; only keeps meaningful values. */
export function coerceDreamFields(data: unknown): DreamDetails {
  const r = (data ?? {}) as Record<string, unknown>;
  const out: DreamDetails = {};
  if (Array.isArray(r.tags)) {
    const tags = r.tags
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
    if (tags.length) out.tags = tags;
  }
  if (r.lucid === true) out.lucid = true;
  if (r.nightmare === true) out.nightmare = true;
  if (typeof r.vividness === "number" && r.vividness >= 1 && r.vividness <= 5) {
    out.vividness = Math.round(r.vividness);
  }
  return out;
}

export type Todo = {
  id: string;
  text: string;
  note: string; // optional longer note/description ("" = none)
  done: boolean;
  dueAt: string | null; // ISO datetime, or null = no due date
  createdAt: string | null; // ISO timestamp
  day: string; // YYYY-MM-DD created — used to flag rolled-over items
  googleTaskId?: string | null; // mapping to a mirrored Google Task
  googleEventId?: string | null; // mapping to a mirrored Calendar event (timed)
};
