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
  focusMin: number;
  day: string; // YYYY-MM-DD
  taskId: string | null;
  createdAt: string | null; // ISO timestamp of completion (for the timeline)
};

export type JournalEntry = {
  day: string; // YYYY-MM-DD (also the doc id)
  note: string;
  mood: MoodKey | null;
};
