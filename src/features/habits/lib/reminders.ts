// src/features/habits/lib/reminders.ts
//
// Pure scheduling math for per-habit reminders. Given "now" and whether the
// habit is already done today, returns the epoch ms of the next reminder to
// fire — or null when there's nothing to schedule within the push window (24h).

import { addDays, dayKeyFor, parseDay } from "@/features/habits/lib/day";
import { isDueOn } from "@/features/habits/lib/streak";
import type { Habit } from "@/features/habits/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function atTime(dayKey: string, hh: number, mm: number): number {
  const d = parseDay(dayKey);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/**
 * Next reminder fire time (epoch ms) for a habit, or null if none is due within
 * the next 24h (the push window). Fires today if scheduled + not yet done + the
 * time is still ahead; otherwise the next scheduled day's time, if within 24h.
 */
export function nextReminderAt(
  habit: Habit,
  now: Date,
  doneToday: boolean
): number | null {
  if (!habit.reminder) return null;
  const [hh, mm] = habit.reminder.split(":").map((n) => Number(n));
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
