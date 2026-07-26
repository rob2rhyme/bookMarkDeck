import { describe, it, expect } from "vitest";
import {
  shouldNudgeFocusStreak,
  focusStreakNudgeAt,
  focusStreakBody,
} from "./streakNudge";

describe("shouldNudgeFocusStreak", () => {
  it("nudges when a streak exists and no session today", () => {
    expect(shouldNudgeFocusStreak(5, 0)).toBe(true);
  });
  it("does not nudge once a session is logged today", () => {
    expect(shouldNudgeFocusStreak(5, 1)).toBe(false);
  });
  it("does not nudge below the streak threshold", () => {
    expect(shouldNudgeFocusStreak(1, 0)).toBe(false);
    expect(shouldNudgeFocusStreak(0, 0)).toBe(false);
  });
});

describe("focusStreakNudgeAt", () => {
  it("schedules for the evening hour when still ahead", () => {
    const now = new Date(2026, 5, 19, 15, 0); // 3pm
    expect(focusStreakNudgeAt(now, 20)).toBe(
      new Date(2026, 5, 19, 20, 0, 0, 0).getTime()
    );
  });
  it("returns null once the evening hour has passed", () => {
    const now = new Date(2026, 5, 19, 21, 0); // 9pm
    expect(focusStreakNudgeAt(now, 20)).toBeNull();
  });
});

describe("focusStreakBody", () => {
  it("names the streak length", () => {
    expect(focusStreakBody(7)).toContain("7-day focus streak");
  });
});
