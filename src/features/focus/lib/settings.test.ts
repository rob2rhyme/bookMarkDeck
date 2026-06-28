import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  normalizeSettings,
} from "@/features/focus/lib/settings";

describe("normalizeSettings", () => {
  it("returns defaults for empty / non-object input", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps numbers into their valid range", () => {
    expect(normalizeSettings({ focus: 999 }).focus).toBe(120);
    expect(normalizeSettings({ focus: 0 }).focus).toBe(1);
    expect(normalizeSettings({ dailyGoalHours: 100 }).dailyGoalHours).toBe(16);
    expect(normalizeSettings({ sessionsUntilLong: 1 }).sessionsUntilLong).toBe(2);
  });

  it("coerces numeric strings and rejects NaN", () => {
    expect(normalizeSettings({ short: "10" }).short).toBe(10);
    expect(normalizeSettings({ short: "abc" }).short).toBe(
      DEFAULT_SETTINGS.short
    );
  });

  it("keeps booleans, falling back when absent or wrong type", () => {
    expect(normalizeSettings({ autoStartFocus: true }).autoStartFocus).toBe(true);
    expect(normalizeSettings({ soundEnabled: "yes" }).soundEnabled).toBe(
      DEFAULT_SETTINGS.soundEnabled
    );
  });

  it("validates chimeSound against known ids", () => {
    expect(normalizeSettings({ chimeSound: "definitely-not-real" }).chimeSound).toBe(
      DEFAULT_SETTINGS.chimeSound
    );
  });

  it("validates meditationAmbient, defaulting to 'off'", () => {
    expect(normalizeSettings({ meditationAmbient: "ocean" }).meditationAmbient).toBe("ocean");
    expect(normalizeSettings({ meditationAmbient: "nope" }).meditationAmbient).toBe("off");
  });

  it("validates quizDifficulty, defaulting to 'all'", () => {
    expect(normalizeSettings({ quizDifficulty: "hard" }).quizDifficulty).toBe("hard");
    expect(normalizeSettings({ quizDifficulty: "medium" }).quizDifficulty).toBe("medium");
    expect(normalizeSettings({ quizDifficulty: "nonsense" }).quizDifficulty).toBe("all");
    expect(normalizeSettings({}).quizDifficulty).toBe("all");
  });
});
