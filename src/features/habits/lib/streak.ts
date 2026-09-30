// src/features/habits/lib/streak.ts
//
// Pure, replayable habit stats engine — the single source of truth for streaks,
// completion %, and "due today". Derived entirely from the entry log + schedule
// so backfilling/editing/importing can't make a stored counter drift. No React,
// no Firebase — fully unit-testable.

import { addDays, dayKeyFor, weekKeyOf, weekdayOf } from "@/features/habits/lib/day";
import {
  type Habit,
  type HabitDirection,
  type HabitEntry,
  type HabitStats,
  habitTarget,
} from "@/features/habits/lib/types";

/** Is the habit scheduled on this day? (timesPerWeek can be done any day.) */
export function isDueOn(habit: Habit, day: string): boolean {
  const s = habit.schedule;
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return s.days.includes(weekdayOf(day));
  return true; // timesPerWeek — loggable any day
}

// A logged day is a "success" when the target is met. For a "quit" habit the
// comparison flips: success = stayed AT OR UNDER the daily limit (binary quit
// stores count 1 ≤ limit 1, i.e. "stayed clean today").
export function isSuccess(
  entry: HabitEntry | undefined,
  target: number,
  direction: HabitDirection = "build"
): boolean {
  if (!entry || entry.status !== "done") return false;
  return direction === "quit" ? entry.count <= target : entry.count >= target;
}

const MAX_LOOKBACK = 800; // hard bound so a sparse log can't loop forever

// Habit "strength" (Loop-style): an exponential moving average of completion
// over scheduled units, so a recent win matters more than an old one and one
// miss doesn't erase weeks of progress. Half-life ≈ 15 scheduled days / 6 weeks.
const DAILY_DECAY = Math.pow(0.5, 1 / 15);
const WEEKLY_DECAY = Math.pow(0.5, 1 / 6);

/**
 * The LOCAL day a habit was created, or null when unknown. `createdAt` is a UTC
 * instant; slicing its date made a habit created on a US evening start the next
 * day, losing that evening's tick from every figure. Nothing is due before it.
 */
export function habitStartDay(habit: Habit): string | null {
  return habit.createdAt ? dayKeyFor(new Date(habit.createdAt)) : null;
}

/** Compute the full stat block for one habit as of `today` (a day key). */
export function computeStats(
  habit: Habit,
  entries: HabitEntry[],
  today: string
): HabitStats {
  const target = habitTarget(habit);
  const byDay = new Map<string, HabitEntry>();
  for (const e of entries) if (e.habitId === habit.id) byDay.set(e.day, e);

  const todayEntry = byDay.get(today);
  const countToday = todayEntry?.status === "done" ? todayEntry.count : 0;
  const doneToday = isSuccess(todayEntry, target, habit.direction);
  const start = habitStartDay(habit);
  const earliest = start && start <= today ? start : null;

  if (habit.schedule.type === "timesPerWeek") {
    return weeklyStats(habit, byDay, target, today, doneToday, countToday);
  }
  return dailyStats(habit, byDay, target, today, earliest, doneToday, countToday);
}

function dailyStats(
  habit: Habit,
  byDay: Map<string, HabitEntry>,
  target: number,
  today: string,
  earliest: string | null,
  doneToday: boolean,
  countToday: number
): HabitStats {
  // Current streak — walk backwards from today. not-scheduled + skipped days
  // are neutral; a missed scheduled day breaks; today-not-yet-done is forgiving.
  let current = 0;
  let day = today;
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    if (earliest && day < earliest) break;
    if (!isDueOn(habit, day)) {
      day = addDays(day, -1);
      continue;
    }
    const e = byDay.get(day);
    if (isSuccess(e, target, habit.direction)) {
      current++;
    } else if (e?.status === "skipped") {
      // neutral
    } else {
      // missed (or not logged)
      if (day === today) {
        // forgiving: today simply isn't counted yet — don't break
      } else {
        break;
      }
    }
    day = addDays(day, -1);
  }

  // Longest streak + total + strength — forward scan over the logged range.
  let longest = 0;
  let run = 0;
  let total = 0;
  let strengthScore = 0;
  const start = earliest ?? oldestKey(byDay) ?? today;
  let cur = start;
  let guard = 0;
  while (cur <= today && guard++ < MAX_LOOKBACK) {
    if (isDueOn(habit, cur)) {
      const e = byDay.get(cur);
      if (isSuccess(e, target, habit.direction)) {
        run++;
        total++;
        if (run > longest) longest = run;
        strengthScore = strengthScore * DAILY_DECAY + (1 - DAILY_DECAY);
      } else if (e?.status === "skipped") {
        // neutral — preserves the run and leaves strength undisturbed
      } else if (cur !== today) {
        run = 0;
        strengthScore = strengthScore * DAILY_DECAY; // a miss decays, never zeroes
      }
      // today-not-yet-done is forgiving: leave strength untouched
    }
    cur = addDays(cur, 1);
  }

  // 30-day completion rate over scheduled, non-skipped days — only those since
  // the habit existed, or four perfect days on a new habit read as 13%.
  let due = 0;
  let hit = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i);
    if (earliest && d < earliest) break;
    if (!isDueOn(habit, d)) continue;
    const e = byDay.get(d);
    if (e?.status === "skipped") continue;
    due++;
    if (isSuccess(e, target, habit.direction)) hit++;
  }
  const rate = due === 0 ? 0 : Math.round((hit / due) * 100);

  return {
    dueToday: isDueOn(habit, today),
    doneToday,
    countToday,
    currentStreak: current,
    longestStreak: longest,
    totalDone: total,
    rate,
    strength: Math.round(strengthScore * 100),
  };
}

function weeklyStats(
  habit: Habit,
  byDay: Map<string, HabitEntry>,
  target: number,
  today: string,
  doneToday: boolean,
  countToday: number
): HabitStats {
  const weekTarget =
    habit.schedule.type === "timesPerWeek" ? habit.schedule.count : 1;

  // Successes bucketed by Sunday-anchored week.
  const perWeek = new Map<string, number>();
  let total = 0;
  for (const e of byDay.values()) {
    if (isSuccess(e, target, habit.direction)) {
      total++;
      const wk = weekKeyOf(e.day);
      perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
    }
  }

  const thisWeek = weekKeyOf(today);
  const weekDone = perWeek.get(thisWeek) ?? 0;

  // Weekly streak — walk back week by week. Current week is forgiving: if it
  // hasn't hit target yet it neither breaks the streak nor counts.
  let current = 0;
  let wk = thisWeek;
  for (let i = 0; i < 200; i++) {
    const done = perWeek.get(wk) ?? 0;
    if (done >= weekTarget) {
      current++;
    } else if (wk === thisWeek) {
      // in-progress week — skip without breaking
    } else {
      break;
    }
    wk = addDays(wk, -7);
  }

  // Longest weekly streak across all logged weeks.
  const weeks = [...perWeek.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    if ((perWeek.get(w) ?? 0) < weekTarget) {
      run = 0;
      prev = w;
      continue;
    }
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = w;
  }
  // Count the current in-progress week toward "longest" only if it qualifies.
  longest = Math.max(longest, current);

  // Strength — EMA of weekly completion fraction across every week since the
  // first log; the in-progress week is forgiving (only counts once it qualifies).
  const oldest = oldestKey(byDay);
  let strengthScore = 0;
  if (oldest) {
    let w2 = weekKeyOf(oldest);
    let g = 0;
    while (w2 <= thisWeek && g++ < 600) {
      const done = perWeek.get(w2) ?? 0;
      const inProgress = w2 === thisWeek && done < weekTarget;
      if (!inProgress) {
        const frac = weekTarget === 0 ? 0 : Math.min(1, done / weekTarget);
        strengthScore = strengthScore * WEEKLY_DECAY + frac * (1 - WEEKLY_DECAY);
      }
      w2 = addDays(w2, 7);
    }
  }

  return {
    // "due today" = scheduled today (forgiving of the weekly quota), matching
    // dailyStats and the today-list logic in useHabits (isDueOn).
    dueToday: isDueOn(habit, today),
    doneToday,
    countToday,
    currentStreak: current,
    longestStreak: longest,
    totalDone: total,
    rate: weekTarget === 0 ? 0 : Math.min(100, Math.round((weekDone / weekTarget) * 100)),
    strength: Math.round(strengthScore * 100),
    weekDone,
    weekTarget,
  };
}

function oldestKey(byDay: Map<string, HabitEntry>): string | null {
  let min: string | null = null;
  for (const k of byDay.keys()) if (min === null || k < min) min = k;
  return min;
}
