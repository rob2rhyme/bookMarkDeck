import { describe, expect, it } from "vitest";

import { nextReminderAt } from "@/features/habits/lib/reminders";
import type { Habit } from "@/features/habits/lib/types";

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "H",
    emoji: "✅",
    hue: 200,
    type: "binary",
    schedule: { type: "daily" },
    reminder: "09:00",
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("nextReminderAt", () => {
  it("returns null without a reminder time", () => {
    expect(nextReminderAt(habit({ reminder: null }), new Date(2026, 5, 19, 8), false)).toBeNull();
  });

  it("fires today when the time is still ahead and not done", () => {
    const now = new Date(2026, 5, 19, 8, 0); // 08:00, reminder 09:00
    const at = nextReminderAt(habit(), now, false);
    expect(at).toBe(new Date(2026, 5, 19, 9, 0).getTime());
  });

  it("rolls to tomorrow once today's time has passed", () => {
    const now = new Date(2026, 5, 19, 10, 0); // past 09:00
    const at = nextReminderAt(habit(), now, false);
    expect(at).toBe(new Date(2026, 5, 20, 9, 0).getTime());
  });

  it("skips today when already done (next day, within the 24h window)", () => {
    const now = new Date(2026, 5, 19, 10, 0); // tomorrow 09:00 is 23h away
    const at = nextReminderAt(habit(), now, true);
    expect(at).toBe(new Date(2026, 5, 20, 9, 0).getTime());
  });

  it("returns null when the next fire is beyond 24h (re-arms later)", () => {
    const now = new Date(2026, 5, 19, 8, 0); // tomorrow 09:00 is 25h away
    expect(nextReminderAt(habit(), now, true)).toBeNull();
  });

  it("returns null when the next scheduled day is beyond 24h", () => {
    // Weekdays-only habit on Friday evening → next is Monday (> 24h away).
    const fri = new Date(2026, 5, 19, 20, 0);
    const at = nextReminderAt(
      habit({ schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } }),
      fri,
      true
    );
    expect(at).toBeNull();
  });
});
