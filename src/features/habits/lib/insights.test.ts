import { describe, expect, it } from "vitest";

import { weekdayPattern, weeklyBars } from "@/features/habits/lib/insights";
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
