// src/features/habits/lib/insights.ts
//
// Pure aggregations for the habit analysis dashboard. Derived from the entry log
// + schedules so the charts can't drift from reality. No React, no Firebase.

import { WEEKDAY_LABELS, addDays, parseDay, weekKeyOf, weekdayOf } from "@/features/habits/lib/day";
import { isDueOn } from "@/features/habits/lib/streak";
import { type Habit, type HabitEntry, habitTarget } from "@/features/habits/lib/types";

function successIndex(habits: Habit[], entries: HabitEntry[]) {
  const target = new Map(habits.map((h) => [h.id, habitTarget(h)]));
  const success = new Set<string>(); // `${habitId}_${day}`
  for (const e of entries) {
    if (e.status !== "done") continue;
    const t = target.get(e.habitId);
    if (t !== undefined && e.count >= t) success.add(`${e.habitId}_${e.day}`);
  }
  return success;
}

export type WeekBar = {
  key: string;
  label: string; // weekday letter
  due: number;
  done: number;
  pct: number; // 0..100
  isToday: boolean;
  future: boolean;
};

/** The 7 days of the week containing `today + weekOffset*7` (Sun-anchored). */
export function weeklyBars(
  habits: Habit[],
  entries: HabitEntry[],
  today: string,
  weekOffset: number
): { bars: WeekBar[]; rangeLabel: string } {
  const success = successIndex(habits, entries);
  const anchor = addDays(today, weekOffset * 7);
  const start = weekKeyOf(anchor);
  const bars: WeekBar[] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(start, i);
    const future = key > today;
    let due = 0;
    let done = 0;
    if (!future) {
      for (const h of habits) {
        if (!isDueOn(h, key)) continue;
        due++;
        if (success.has(`${h.id}_${key}`)) done++;
      }
    }
    bars.push({
      key,
      label: WEEKDAY_LABELS[weekdayOf(key)][0],
      due,
      done,
      pct: due === 0 ? 0 : Math.round((done / due) * 100),
      isToday: key === today,
      future,
    });
  }
  const end = addDays(start, 6);
  return { bars, rangeLabel: `${pretty(start)} – ${pretty(end)}` };
}

export type WeekdayStat = { label: string; pct: number; due: number };

/** Average completion rate per weekday over the trailing window. */
export function weekdayPattern(
  habits: Habit[],
  entries: HabitEntry[],
  today: string,
  windowDays = 84
): WeekdayStat[] {
  const success = successIndex(habits, entries);
  const due = new Array(7).fill(0);
  const done = new Array(7).fill(0);
  for (let i = 0; i < windowDays; i++) {
    const key = addDays(today, -i);
    const wd = weekdayOf(key);
    for (const h of habits) {
      if (!isDueOn(h, key)) continue;
      due[wd]++;
      if (success.has(`${h.id}_${key}`)) done[wd]++;
    }
  }
  return WEEKDAY_LABELS.map((label, wd) => ({
    label,
    due: due[wd],
    pct: due[wd] === 0 ? 0 : Math.round((done[wd] / due[wd]) * 100),
  }));
}

function pretty(key: string): string {
  const d = parseDay(key);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
