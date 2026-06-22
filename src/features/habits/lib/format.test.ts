import { describe, expect, it } from "vitest";

import { DEFAULT_HABIT_EMOJI, habitEmoji, suggestEmoji } from "@/features/habits/lib/format";
import type { Habit } from "@/features/habits/lib/types";

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Wine",
    emoji: DEFAULT_HABIT_EMOJI,
    hue: 200,
    type: "binary",
    schedule: { type: "daily" },
    archived: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("suggestEmoji", () => {
  it("maps drink-related names to a glass", () => {
    expect(suggestEmoji("Wine")).toBe("🍷");
    expect(suggestEmoji("Hard Drinks (Rum, Whiskey)")).toBe("🥃");
  });

  it("maps activity names", () => {
    expect(suggestEmoji("Gym")).toBe("💪");
    expect(suggestEmoji("Swim")).toBe("🏊");
    expect(suggestEmoji("Hike")).toBe("🥾");
    expect(suggestEmoji("Lunch Out with Family")).toBe("🍽️");
  });

  it("is case-insensitive and matches substrings", () => {
    expect(suggestEmoji("morning RUN")).toBe("🏃");
  });

  it("returns empty string when nothing fits", () => {
    expect(suggestEmoji("Lalgedi")).toBe("");
    expect(suggestEmoji("")).toBe("");
  });
});

describe("habitEmoji", () => {
  it("keeps an explicitly chosen emoji", () => {
    expect(habitEmoji(habit({ name: "Wine", emoji: "🦏" }))).toBe("🦏");
  });

  it("derives from the name when still the default", () => {
    expect(habitEmoji(habit({ name: "Wine", emoji: DEFAULT_HABIT_EMOJI }))).toBe("🍷");
  });

  it("falls back to the default when the name yields no guess", () => {
    expect(habitEmoji(habit({ name: "Lalgedi", emoji: DEFAULT_HABIT_EMOJI }))).toBe(
      DEFAULT_HABIT_EMOJI
    );
  });
});
