import { describe, expect, it } from "vitest";

import { habitMomentum, weekdayPattern, weeklyBars } from "@/features/habits/lib/insights";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const TODAY = "2026-06-19"; // Friday; its week is Sun 06-14 … Sat 06-20

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "H",
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
const e = (day: string): HabitEntry => ({
  id: `h_${day}`,
  habitId: "h",
  day,
  status: "done",
  count: 1,
  createdAt: null,
});

describe("weeklyBars", () => {
  it("buckets completions into the right weekday and marks future/today", () => {
    const { bars } = weeklyBars([habit()], [e("2026-06-18"), e("2026-06-19")], TODAY, 0);
    expect(bars).toHaveLength(7);
    const fri = bars.find((b) => b.key === "2026-06-19")!;
    expect(fri.isToday).toBe(true);
    expect(fri.done).toBe(1);
    expect(fri.pct).toBe(100);
    const sat = bars.find((b) => b.key === "2026-06-20")!; // tomorrow
    expect(sat.future).toBe(true);
    expect(sat.due).toBe(0);
    const thu = bars.find((b) => b.key === "2026-06-18")!;
    expect(thu.done).toBe(1);
  });

  it("previous week offset shifts the range", () => {
    const cur = weeklyBars([habit()], [], TODAY, 0).rangeLabel;
    const prev = weeklyBars([habit()], [], TODAY, -1).rangeLabel;
    expect(cur).not.toBe(prev);
  });
});

describe("weekdayPattern", () => {
  it("returns 7 weekday buckets with completion rates", () => {
    const rows = weekdayPattern([habit()], [e("2026-06-19")], TODAY, 14);
    expect(rows).toHaveLength(7);
    const fri = rows[5]; // Friday
    expect(fri.label).toBe("Fri");
    expect(fri.pct).toBeGreaterThan(0);
  });
});

describe("habitMomentum", () => {
  it("reports last-done, a 14-day strip, and window/this-week counts (daily)", () => {
    const m = habitMomentum(habit(), [e("2026-06-18"), e("2026-06-16")], TODAY);
    expect(m.lastDoneDay).toBe("2026-06-18");
    expect(m.strip).toHaveLength(14);
    expect(m.strip[m.strip.length - 1].key).toBe(TODAY);
    // 06-18 done, 06-16 done; today + others within the daily window are missed.
    expect(m.strip.find((d) => d.key === "2026-06-18")!.state).toBe("done");
    expect(m.strip.find((d) => d.key === TODAY)!.state).toBe("missed");
    expect(m.windowDone).toBe(2);
    expect(m.windowDue).toBe(14);
    expect(m.thisWeekDone).toBe(2); // 06-16 and 06-18 are both in this week
  });

  it("marks skipped days and never 'missed' for times-a-week habits", () => {
    const weekly = habit({ schedule: { type: "timesPerWeek", count: 3 } });
    const skip: HabitEntry = { ...e("2026-06-17"), status: "skipped", count: 0 };
    const m = habitMomentum(weekly, [e("2026-06-18"), skip], TODAY);
    expect(m.strip.find((d) => d.key === "2026-06-17")!.state).toBe("skipped");
    // weekly habits have no daily obligation → non-done days are "off", not "missed"
    expect(m.strip.some((d) => d.state === "missed")).toBe(false);
    expect(m.windowDue).toBe(0);
  });

  it("returns null last-done when never completed", () => {
    expect(habitMomentum(habit(), [], TODAY).lastDoneDay).toBeNull();
  });
});
