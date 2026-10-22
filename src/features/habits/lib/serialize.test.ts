import { describe, expect, it } from "vitest";

import { coerceHabit, habitToDoc } from "@/features/habits/lib/serialize";

const raw = (over: Record<string, unknown> = {}) => ({
  name: "Stretch",
  emoji: "🧘",
  hue: 200,
  type: "binary",
  schedule: { type: "daily" },
  reminder: "08:00",
  ...over,
});

describe("extra reminder times", () => {
  it("reads them, normalised, and drops junk", () => {
    const h = coerceHabit("h1", raw({ extraReminders: ["9:30", "nope", "20:00"] }))!;
    expect(h.reminder).toBe("08:00");
    expect(h.extraReminders).toEqual(["09:30", "20:00"]);
  });

  it("reads a habit saved before they existed", () => {
    expect(coerceHabit("h1", raw())!.extraReminders).toBeUndefined();
  });

  it("always writes them, so a removed time is removed from the cloud copy too", () => {
    const without = coerceHabit("h1", raw())!;
    expect(habitToDoc(without).extraReminders).toEqual([]);
    const withTwo = coerceHabit("h1", raw({ extraReminders: ["20:00"] }))!;
    expect(habitToDoc(withTwo).extraReminders).toEqual(["20:00"]);
  });
});
