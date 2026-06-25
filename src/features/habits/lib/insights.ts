// src/features/habits/lib/insights.ts
//
// Pure aggregations for the habit analysis dashboard. Derived from the entry log
// + schedules so the charts can't drift from reality. No React, no Firebase.

import { WEEKDAY_LABELS, addDays, dayKeyFor, parseDay, weekKeyOf, weekdayOf } from "@/features/habits/lib/day";
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

/**
 * habitId → the local day a habit was created (or null when unknown). Used to
 * avoid counting a habit as "due" on days before it existed, which would crush
 * completion rates for new trackers.
 */
function createdDayIndex(habits: Habit[]): Map<string, string | null> {
  return new Map(
    habits.map((h) => [h.id, h.createdAt ? dayKeyFor(new Date(h.createdAt)) : null])
  );
}

/** The 7 days of the week containing `today + weekOffset*7` (Sun-anchored). */
export function weeklyBars(
  habits: Habit[],
  entries: HabitEntry[],
  today: string,
  weekOffset: number
): { bars: WeekBar[]; rangeLabel: string } {
  const success = successIndex(habits, entries);
  const created = createdDayIndex(habits);
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
        const cd = created.get(h.id);
        if (cd && key < cd) continue; // habit didn't exist yet
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
  const created = createdDayIndex(habits);
  const due = new Array(7).fill(0);
  const done = new Array(7).fill(0);
  for (let i = 0; i < windowDays; i++) {
    const key = addDays(today, -i);
    const wd = weekdayOf(key);
    for (const h of habits) {
      const cd = created.get(h.id);
      if (cd && key < cd) continue; // habit didn't exist yet
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

export type DayState = "done" | "skipped" | "missed" | "off";

export type HabitMomentum = {
  /** Most recent day the habit was successfully completed, or null. */
  lastDoneDay: string | null;
  lastDoneCount: number;
  /** Per-day states over the trailing window, oldest → newest. */
  strip: { key: string; state: DayState }[];
  /** Scheduled days hit / scheduled in the window (daily/weekdays only). */
  windowDone: number;
  windowDue: number;
  /** Successes / scheduled-so-far this (Sun-anchored) week. */
  thisWeekDone: number;
  thisWeekDue: number;
};

/**
 * Per-habit recency + cadence for the expandable detail view. For
 * times-a-week habits there's no daily obligation, so non-done days read as
 * "off" (never "missed") and the window rate is left at zero — the weekly
 * count is the meaningful figure instead.
 */
export function habitMomentum(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
  windowDays = 14
): HabitMomentum {
  const target = habitTarget(habit);
  const weekly = habit.schedule.type === "timesPerWeek";
  const byDay = new Map<string, HabitEntry>();
  for (const e of entries) {
    if (e.habitId === habit.id) byDay.set(e.day, e);
  }
  const isSuccess = (e?: HabitEntry) =>
    Boolean(e && e.status === "done" && e.count >= target);

  let lastDoneDay: string | null = null;
  let lastDoneCount = 0;
  for (const [day, e] of byDay) {
    if (isSuccess(e) && (!lastDoneDay || day > lastDoneDay)) {
      lastDoneDay = day;
      lastDoneCount = e.count;
    }
  }

  const strip: { key: string; state: DayState }[] = [];
  let windowDone = 0;
  let windowDue = 0;
  for (let i = windowDays - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const e = byDay.get(key);
    const due = isDueOn(habit, key);
    let state: DayState;
    if (isSuccess(e)) state = "done";
    else if (e?.status === "skipped") state = "skipped";
    else if (due && !weekly) state = "missed";
    else state = "off";
    if (due && !weekly) {
      windowDue++;
      if (state === "done") windowDone++;
    }
    strip.push({ key, state });
  }

  const weekStart = weekKeyOf(today);
  let thisWeekDone = 0;
  let thisWeekDue = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i);
    if (key > today) break;
    if (isDueOn(habit, key) && !weekly) thisWeekDue++;
    if (isSuccess(byDay.get(key))) thisWeekDone++;
  }

  return {
    lastDoneDay,
    lastDoneCount,
    strip,
    windowDone,
    windowDue,
    thisWeekDone,
    thisWeekDue,
  };
}
