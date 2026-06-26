import { describe, expect, it } from "vitest";

import { computeStats, isDueOn } from "@/features/habits/lib/streak";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const TODAY = "2026-06-19"; // a Friday

function mk(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Test",
    emoji: "✅",
    hue: 200,
    type: "binary",
    schedule: { type: "daily" },
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function e(
  day: string,
  status: "done" | "skipped" = "done",
  count = 1
): HabitEntry {
  return { id: `h_${day}`, habitId: "h", day, status, count, createdAt: null };
}

describe("computeStats — daily", () => {
  it("counts a clean current streak", () => {
    const s = computeStats(mk(), [e("2026-06-19"), e("2026-06-18"), e("2026-06-17")], TODAY);
    expect(s.currentStreak).toBe(3);
    expect(s.doneToday).toBe(true);
    expect(s.totalDone).toBe(3);
  });

  it("is forgiving: today not yet done doesn't break the streak", () => {
    const s = computeStats(mk(), [e("2026-06-18"), e("2026-06-17")], TODAY);
    expect(s.doneToday).toBe(false);
    expect(s.currentStreak).toBe(2);
    expect(s.dueToday).toBe(true);
  });

  it("a missed scheduled day breaks the streak", () => {
    // today done, yesterday missing (no entry) → only today counts
    const s = computeStats(mk(), [e("2026-06-19"), e("2026-06-17")], TODAY);
    expect(s.currentStreak).toBe(1);
  });

  it("a skipped day is neutral (neither breaks nor counts)", () => {
    const s = computeStats(
      mk(),
      [e("2026-06-19"), e("2026-06-18", "skipped"), e("2026-06-17")],
      TODAY
    );
    expect(s.currentStreak).toBe(2);
  });

  it("longest streak survives a later break", () => {
    const days = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].map((d) => e(d));
    // gap on 06-05..18, then today only
    const s = computeStats(mk(), [...days, e("2026-06-19")], TODAY);
    expect(s.longestStreak).toBe(4);
    expect(s.currentStreak).toBe(1);
  });
});

describe("computeStats — measurable", () => {
  it("is only done when the value meets the target", () => {
    const habit = mk({ type: "measurable", target: 5, unit: "cups" });
    const below = computeStats(habit, [e("2026-06-19", "done", 3)], TODAY);
    expect(below.doneToday).toBe(false);
    expect(below.countToday).toBe(3);
    expect(below.currentStreak).toBe(0);

    const met = computeStats(habit, [e("2026-06-19", "done", 5)], TODAY);
    expect(met.doneToday).toBe(true);
    expect(met.currentStreak).toBe(1);
  });
});

describe("computeStats — weekdays schedule", () => {
  const habit = mk({ schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } });

  it("weekend (unscheduled) days are neutral — streak spans them", () => {
    // Mon 06-22 done + Fri 06-19 done; Sat/Sun 06-20/21 unscheduled
    const s = computeStats(habit, [e("2026-06-22"), e("2026-06-19")], "2026-06-22");
    expect(s.currentStreak).toBe(2);
  });

  it("isDueOn respects the weekday mask", () => {
    expect(isDueOn(habit, "2026-06-20")).toBe(false); // Saturday
    expect(isDueOn(habit, "2026-06-19")).toBe(true); // Friday
  });
});

describe("computeStats — timesPerWeek", () => {
  const habit = mk({ schedule: { type: "timesPerWeek", count: 3 } });

  it("tracks weekly progress and a forgiving in-progress week", () => {
    const entries = [
      // this week (Sun 06-14 … Sat 06-20): 2 of 3 so far
      e("2026-06-19"),
      e("2026-06-18"),
      // last full week (06-07 … 06-13): 3 of 3 → a completed week
      e("2026-06-12"),
      e("2026-06-11"),
      e("2026-06-10"),
    ];
    const s = computeStats(habit, entries, TODAY);
    expect(s.weekDone).toBe(2);
    expect(s.weekTarget).toBe(3);
    expect(s.dueToday).toBe(true); // still under target this week
    expect(s.currentStreak).toBe(1); // last week counts; this week in progress
    expect(s.totalDone).toBe(5);
  });
});

describe("computeStats — strength", () => {
  it("is 0 with no completions and rises with consistency", () => {
    const none = computeStats(mk(), [], TODAY);
    expect(none.strength).toBe(0);

    const days = Array.from({ length: 30 }, (_, i) => e(addBack(TODAY, i)));
    const strong = computeStats(mk(), days, TODAY);
    expect(strong.strength).toBeGreaterThan(70);
  });

  it("decays but never zeroes after a recent miss", () => {
    const days = Array.from({ length: 30 }, (_, i) => e(addBack(TODAY, i + 1)));
    const beforeMiss = computeStats(mk(), days, addBack(TODAY, 1)).strength;
    // …then a missed `today` (no entry for TODAY) — strength dips, stays > 0.
    const afterMiss = computeStats(mk(), days, addBack(TODAY, -1)).strength;
    expect(afterMiss).toBeLessThan(beforeMiss);
    expect(afterMiss).toBeGreaterThan(0);
  });
});

function addBack(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d - n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
