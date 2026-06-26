// src/features/habits/lib/types.ts
//
// Framework-free domain types for the habit tracker. Kept dependency-light so
// the pure streak engine + tests never import React or Firebase.

/** Binary = one tap done/not-done. Measurable = a value toward a daily target. */
export type HabitType = "binary" | "measurable";

/**
 * Build = do it (more/consistent is better; success = met the target).
 * Quit = avoid/reduce it (less is better; binary success = stayed clean,
 * measurable success = stayed at or under the daily limit).
 */
export type HabitDirection = "build" | "quit";

/** Schedule cadence. `days` uses 0=Sun … 6=Sat (JS getDay convention). */
export type HabitSchedule =
  | { type: "daily" }
  | { type: "weekdays"; days: number[] }
  | { type: "timesPerWeek"; count: number };

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  hue: number; // accent hue 0–360
  type: HabitType;
  direction?: HabitDirection; // default "build"; "quit" = avoid/reduce
  unit?: string; // measurable only, e.g. "cups", "pages"
  target?: number; // build: daily target (min); quit: daily limit (max); binary = 1
  step?: number; // measurable +/- increment (default 1)
  schedule: HabitSchedule;
  identity?: string; // "become someone who…"
  area?: string; // optional category/grouping label (e.g. "Health", "Work")
  areaIcon?: string; // emoji shown for the habit's area
  reminder?: string | null; // "HH:MM" — stored for a later reminders pass
  archived: boolean;
  sortOrder: number;
  createdAt: string | null; // ISO
};

/** Per-day log. `status:'skipped'` is streak-neutral (neither breaks nor counts). */
export type EntryStatus = "done" | "skipped";

export type HabitEntry = {
  id: string; // deterministic `${habitId}_${day}`
  habitId: string;
  day: string; // local YYYY-MM-DD
  status: EntryStatus;
  count: number; // measurable value; binary stores the target (≥1)
  note?: string; // optional short note for the day
  at?: string | null; // optional clock time "HH:MM" the habit was done
  createdAt: string | null;
};

export type HabitStats = {
  dueToday: boolean;
  doneToday: boolean;
  countToday: number;
  currentStreak: number;
  longestStreak: number;
  totalDone: number;
  rate: number; // 0–100, completion % over the last 30 scheduled (non-skipped) days
  strength: number; // 0–100, exponentially-decayed momentum (recent days weigh more)
  weekDone?: number; // timesPerWeek: successes in the current week
  weekTarget?: number; // timesPerWeek: target per week
};

/** A daily target of 1 for binary; the configured target (≥1) for measurable. */
export function habitTarget(habit: Habit): number {
  if (habit.type === "measurable") return Math.max(1, habit.target ?? 1);
  return 1;
}
