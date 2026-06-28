// Journal-habit ↔ Focus-journal bridge helpers.
//
// The Focus page records reflections as timestamped notes in the focusNotes
// collection (one or more per day); the Habits page can track a binary "Journal"
// habit. When such a habit exists we mark it done whenever a Focus note exists
// for the day — mirroring how the water habit follows Focus hydration. The two
// surfaces never mount together, so the link is read from Firestore (when
// synced) plus a best-effort read of Focus's own localStorage cache (so the
// habit reflects the latest even offline).
//
// Unlike water (a count that moves both ways), journaling is binary and has no
// forward write — there's no note text to synthesise from a habit tap — so this
// link is raise-only: a Focus note marks the habit done, but removing the note
// never un-marks it (that would bounce a manual tap).

import type { Habit } from "@/features/habits/lib/types";

/**
 * A binary habit whose NAME or identity reads as journaling. Deliberately
 * strict (a journal-y name, not the emoji alone) so an unrelated binary habit
 * won't get auto-completed by Focus notes.
 */
export function isJournalHabit(habit: Habit): boolean {
  if (habit.type !== "binary") return false;
  const text = `${habit.name} ${habit.identity ?? ""}`.toLowerCase();
  return /journal|diary/.test(text);
}

// Mirrors the notes shape written by features/focus/hooks/useFocusJournal.ts.
// Kept here (rather than importing Focus internals) so the dependency points one
// way and Focus stays removable.
const FOCUS_NOTES_KEY = "bookmarkdeck:focus:notes:v1";

function notesKey(email: string | null | undefined): string {
  return email ? `${FOCUS_NOTES_KEY}:${email}` : FOCUS_NOTES_KEY;
}

/**
 * Whether Focus's local notes cache holds at least one note for `day`
 * (YYYY-MM-DD). Lets the Habits page reflect a Focus journal entry even before/
 * without cloud sync. Null on read failure (caller treats as "unknown").
 */
export function focusHasJournalNote(
  email: string | null | undefined,
  day: string
): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(notesKey(email));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    return parsed.some(
      (n) =>
        n &&
        n.day === day &&
        typeof n.text === "string" &&
        n.text.trim().length > 0
    );
  } catch {
    return null;
  }
}
