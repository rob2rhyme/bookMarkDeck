import { describe, expect, it } from "vitest";

import { habitsFromJson, habitsToJson } from "./exportHabits";
import type { Habit, HabitEntry } from "./types";

const habit: Habit = {
  id: "h1",
  name: "Read",
  emoji: "📚",
  hue: 200,
  type: "binary",
  direction: "build",
  schedule: { type: "daily" },
  archived: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  reminder: null,
};

const entry: HabitEntry = {
  id: "h1_2026-01-02",
  habitId: "h1",
  day: "2026-01-02",
  status: "done",
  count: 1,
  note: "felt good",
  at: "8:30",
  createdAt: "2026-01-02T08:30:00.000Z",
};

describe("habits export → import round-trip", () => {
  it("preserves habits and entries through JSON", () => {
    const json = habitsToJson([habit], [entry], "2026-01-03T00:00:00.000Z");
    const parsed = habitsFromJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.habits).toHaveLength(1);
    expect(parsed!.habits[0]).toMatchObject({ id: "h1", name: "Read", hue: 200 });
    expect(parsed!.entries).toHaveLength(1);
    expect(parsed!.entries[0]).toMatchObject({
      id: "h1_2026-01-02",
      status: "done",
      note: "felt good",
      at: "8:30",
    });
  });

  it("rejects junk and empty payloads", () => {
    expect(habitsFromJson("not json")).toBeNull();
    expect(habitsFromJson("{}")).toBeNull();
    expect(habitsFromJson('{"habits":[],"entries":[]}')).toBeNull();
  });

  it("drops malformed records instead of trusting them", () => {
    const json = JSON.stringify({
      habits: [{ id: "ok", name: "Walk", schedule: { type: "daily" } }, { id: "bad" }],
      entries: [{ id: "e", habitId: "ok", day: "not-a-day", status: "done" }],
    });
    const parsed = habitsFromJson(json);
    expect(parsed!.habits.map((h) => h.id)).toEqual(["ok"]); // nameless dropped
    expect(parsed!.entries).toHaveLength(0); // bad day dropped
  });
});
