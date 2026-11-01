// src/features/habits/lib/reminders.ts
//
// Pure scheduling math for per-habit reminders. Given "now" and whether the
// habit is already done today, returns the epoch ms of the next reminder to
// fire — or null when there's nothing to schedule within the push window (24h).

import { addDays, dayKeyFor, parseDay } from "@/features/habits/lib/day";
import { isDueOn } from "@/features/habits/lib/streak";
import type { Habit } from "@/features/habits/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A habit can remind at up to this many times a day. */
export const MAX_REMINDERS = 4;

/** "H:MM" / "HH:MM" → zero-padded "HH:MM", or null if it isn't a real time of day. */
export function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Every reminder time a habit has, valid and unique, earliest first, at most
 * MAX_REMINDERS. `reminder` is the first and `extraReminders` the rest — kept
 * as two fields so older bundles and backups that know only `reminder` still
 * read the habit.
 */
export function reminderTimes(habit: Pick<Habit, "reminder" | "extraReminders">): string[] {
  const all = [habit.reminder, ...(habit.extraReminders ?? [])]
    .map(normalizeTime)
    .filter((t): t is string => t !== null);
  return [...new Set(all)].sort().slice(0, MAX_REMINDERS);
}

/**
 * The `reminder` / `extraReminders` pair to store for the times typed in the
 * editor: blanks and invalid entries dropped, duplicates merged, earliest first.
 * No times → `reminder: null` and no extras.
 */
export function reminderFields(
  first: string,
  extra: string[]
): { reminder: string | null; extraReminders: string[] | undefined } {
  const [head, ...rest] = reminderTimes({ reminder: first, extraReminders: extra });
  return { reminder: head ?? null, extraReminders: rest.length ? rest : undefined };
}

/** "08:00, 20:00" for a card; "" when the habit has no reminder. */
export function reminderLabel(habit: Pick<Habit, "reminder" | "extraReminders">): string {
  return reminderTimes(habit).join(", ");
}

function atTime(dayKey: string, hh: number, mm: number): number {
  const d = parseDay(dayKey);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/**
 * Next fire time (epoch ms) of one reminder time — `time`, or the habit's first
 * — or null if none is due within the next 24h (the push window). Fires today if
 * scheduled + not yet done + the time is still ahead; otherwise the next
 * scheduled day's time, if within 24h. A habit done today silences every
 * remaining time today, since they all ask the same question.
 */
export function nextReminderAt(
  habit: Habit,
  now: Date,
  doneToday: boolean,
  time: string | null | undefined = habit.reminder
): number | null {
  if (!time) return null;
  const [hh, mm] = time.split(":").map((n) => Number(n));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;

  const nowMs = now.getTime();
  const todayKey = dayKeyFor(now);
  if (isDueOn(habit, todayKey) && !doneToday) {
    const todayAt = atTime(todayKey, hh, mm);
    if (todayAt > nowMs) return todayAt;
  }
  for (let i = 1; i <= 7; i++) {
    const key = addDays(todayKey, i);
    if (isDueOn(habit, key)) {
      const at = atTime(key, hh, mm);
      return at - nowMs <= DAY_MS ? at : null;
    }
  }
  return null;
}

/**
 * Notification body for a habit reminder. A reminder only fires for a habit
 * that isn't done yet, so when there's a live streak to protect
 * (`currentStreak >= 2`) the day's reminder is that streak's last chance —
 * frame it around the streak (the strongest retention nudge). Otherwise fall
 * back to identity-based, then plain copy.
 */
export function reminderBody(habit: Habit, currentStreak = 0): string {
  if (currentStreak >= 2) {
    return `Keep your ${currentStreak}-day streak alive — ${habit.name} today.`;
  }
  if (habit.identity) {
    return `Time to ${habit.name.toLowerCase()} — ${habit.identity}.`;
  }
  return `Time for ${habit.name}.`;
}
