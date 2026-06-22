import { describe, expect, it } from "vitest";

import { correlateHabit, focusMinutesByDay } from "@/features/habits/lib/correlate";
import { addDays } from "@/features/habits/lib/day";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const TODAY = "2026-06-19";

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Meditate",
    emoji: "🧘",
    hue: 270,
    type: "binary",
    schedule: { type: "daily" },
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("focusMinutesByDay", () => {
  it("sums focus minutes per day", () => {
    const m = focusMinutesByDay([
      { day: "2026-06-19", focusMin: 25 },
      { day: "2026-06-19", focusMin: 25 },
      { day: "2026-06-18", focusMin: 50 },
    ]);
    expect(m.get("2026-06-19")).toBe(50);
    expect(m.get("2026-06-18")).toBe(50);
  });
});

describe("correlateHabit", () => {
  it("finds more focus on done days", () => {
    const entries: HabitEntry[] = [];
    const focus: { day: string; focusMin: number }[] = [];
    // Alternate: even offsets = habit done + 60 min focus; odd = not done + 20 min
    for (let i = 0; i < 20; i++) {
      const day = addDays(TODAY, -i);
      if (i % 2 === 0) {
        entries.push({ id: `h_${day}`, habitId: "h", day, status: "done", count: 1, createdAt: null });
        focus.push({ day, focusMin: 60 });
      } else {
        focus.push({ day, focusMin: 20 });
      }
    }
    const c = correlateHabit(habit(), entries, focusMinutesByDay(focus), TODAY, 20);
    expect(c).not.toBeNull();
    expect(c!.doneAvg).toBe(60);
    expect(c!.missAvg).toBe(20);
    expect(c!.deltaPct).toBe(200);
  });

  it("returns null without enough data in both groups", () => {
    const entries: HabitEntry[] = [
      { id: "h_2026-06-19", habitId: "h", day: "2026-06-19", status: "done", count: 1, createdAt: null },
    ];
    const c = correlateHabit(habit(), entries, new Map(), TODAY);
    expect(c).toBeNull();
  });
});
