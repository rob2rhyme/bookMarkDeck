import { describe, expect, it } from "vitest";

import {
  MAX_REMINDERS,
  nextReminderAt,
  normalizeTime,
  reminderBody,
  reminderFields,
  reminderLabel,
  reminderTimes,
} from "@/features/habits/lib/reminders";
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

describe("reminderBody", () => {
  it("frames a live streak (>=2) as at-risk — the streak nudge", () => {
    expect(reminderBody(habit({ name: "Meditate" }), 12)).toBe(
      "Keep your 12-day streak alive — Meditate today."
    );
  });

  it("uses identity copy when there is no streak to protect", () => {
    expect(
      reminderBody(habit({ name: "Run", identity: "I am a runner" }), 0)
    ).toBe("Time to run — I am a runner.");
  });

  it("falls back to plain copy below the streak threshold", () => {
    expect(reminderBody(habit({ name: "Floss" }), 1)).toBe("Time for Floss.");
  });
});

describe("normalizeTime", () => {
  it("zero-pads real times and rejects everything else", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("20:00")).toBe("20:00");
    for (const bad of ["24:00", "12:60", "noon", "", "9", "09:5", null, undefined, 900]) {
      expect(normalizeTime(bad)).toBeNull();
    }
  });
});

describe("reminderTimes", () => {
  it("lists every time once, earliest first", () => {
    expect(reminderTimes({ reminder: "20:00", extraReminders: ["8:00", "20:00", "13:30"] })).toEqual([
      "08:00",
      "13:30",
      "20:00",
    ]);
  });

  it("reads a habit that has only the single `reminder`, or none", () => {
    expect(reminderTimes({ reminder: "09:00" })).toEqual(["09:00"]);
    expect(reminderTimes({ reminder: null })).toEqual([]);
    expect(reminderTimes({ reminder: null, extraReminders: ["07:00"] })).toEqual(["07:00"]);
  });

  it("drops junk and caps the count", () => {
    expect(reminderTimes({ reminder: "09:00", extraReminders: ["junk", "25:00"] })).toEqual(["09:00"]);
    const many = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"];
    expect(reminderTimes({ reminder: "05:00", extraReminders: many })).toHaveLength(MAX_REMINDERS);
  });

  it("labels them for a card", () => {
    expect(reminderLabel({ reminder: "20:00", extraReminders: ["08:00"] })).toBe("08:00, 20:00");
    expect(reminderLabel({ reminder: null })).toBe("");
  });
});

describe("reminderFields", () => {
  it("keeps the earliest as the first time and the rest as extras", () => {
    expect(reminderFields("20:00", ["08:00"])).toEqual({ reminder: "08:00", extraReminders: ["20:00"] });
  });

  it("stores nothing extra for a single time, and nothing at all for none", () => {
    expect(reminderFields("09:00", [])).toEqual({ reminder: "09:00", extraReminders: undefined });
    expect(reminderFields("", ["", "junk"])).toEqual({ reminder: null, extraReminders: undefined });
  });

  it("merges a duplicate time entered twice", () => {
    expect(reminderFields("09:00", ["9:00"])).toEqual({ reminder: "09:00", extraReminders: undefined });
  });
});

describe("nextReminderAt for a chosen time", () => {
  it("uses the time it is given, not the habit's first", () => {
    const now = new Date(2026, 5, 19, 10, 0);
    const h = habit({ reminder: "09:00", extraReminders: ["20:00"] });
    expect(nextReminderAt(h, now, false, "20:00")).toBe(new Date(2026, 5, 19, 20, 0).getTime());
    // 09:00 has passed today, so its next fire is tomorrow.
    expect(nextReminderAt(h, now, false, "09:00")).toBe(new Date(2026, 5, 20, 9, 0).getTime());
  });

  it("a habit done today skips today's later times too", () => {
    const now = new Date(2026, 5, 19, 10, 0);
    const h = habit({ reminder: "09:00", extraReminders: ["20:00"] });
    // 20:00 tomorrow is 34h away: nothing within the push window.
    expect(nextReminderAt(h, now, true, "20:00")).toBeNull();
  });
});
