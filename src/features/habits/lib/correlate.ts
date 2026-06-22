// src/features/habits/lib/correlate.ts
//
// The moat: correlate a habit with focus output. For each habit, compare average
// focus minutes on days the habit was DONE vs scheduled-but-not-done — "you focus
// X% more on days you meditate." Pure (no React/Firebase); fully testable.

import { addDays, isDayKey } from "@/features/habits/lib/day";
import { isDueOn } from "@/features/habits/lib/streak";
import { type Habit, type HabitEntry, habitTarget } from "@/features/habits/lib/types";

export type FocusByDay = Map<string, number>;

/** Total focus minutes per local day, from focus session records. */
export function focusMinutesByDay(
  sessions: { day: string; focusMin: number }[]
): FocusByDay {
  const map: FocusByDay = new Map();
  for (const s of sessions) {
    if (!isDayKey(s.day) || typeof s.focusMin !== "number") continue;
    map.set(s.day, (map.get(s.day) ?? 0) + s.focusMin);
  }
  return map;
}

export type Correlation = {
  habitId: string;
  doneAvg: number; // avg focus minutes on done days
  missAvg: number; // avg focus minutes on scheduled, not-done days
  doneDays: number;
  missDays: number;
  deltaPct: number | null; // % more focus on done days (null if not computable)
};

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Correlate one habit with focus minutes over the trailing window. Returns null
 * unless there are at least `minDays` days in BOTH groups (so the comparison is
 * meaningful).
 */
export function correlateHabit(
  habit: Habit,
  entries: HabitEntry[],
  focusByDay: FocusByDay,
  today: string,
  windowDays = 60,
  minDays = 4
): Correlation | null {
  const target = habitTarget(habit);
  const success = new Set<string>();
  for (const e of entries) {
    if (e.habitId === habit.id && e.status === "done" && e.count >= target) {
      success.add(e.day);
    }
  }
  const done: number[] = [];
  const miss: number[] = [];
  for (let i = 0; i < windowDays; i++) {
    const day = addDays(today, -i);
    if (!isDueOn(habit, day)) continue;
    const focus = focusByDay.get(day) ?? 0;
    if (success.has(day)) done.push(focus);
    else miss.push(focus); // scheduled but not a success
  }
  if (done.length < minDays || miss.length < minDays) return null;
  const doneAvg = avg(done);
  const missAvg = avg(miss);
  const deltaPct = missAvg > 0 ? Math.round(((doneAvg - missAvg) / missAvg) * 100) : null;
  return {
    habitId: habit.id,
    doneAvg: Math.round(doneAvg),
    missAvg: Math.round(missAvg),
    doneDays: done.length,
    missDays: miss.length,
    deltaPct,
  };
}
