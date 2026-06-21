// Focus settings shape + defaults. Kept framework-free so both the data layer
// and hooks can import it without cycles.

import { isSoundId, type SoundId } from "@/features/focus/lib/sound";

export type FocusSettings = {
  // Timer durations (minutes)
  focus: number;
  short: number;
  long: number;
  sessionsUntilLong: number;
  // Automation
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  chimeSound: SoundId;
  // Hydration
  hydrationEnabled: boolean;
  hydrationIntervalMin: number;
  waterGoal: number;
  // Daily focus goal (hours)
  dailyGoalHours: number;
  // Mirror to-dos to Google Tasks (+ Calendar events for timed ones)
  todoGoogleSync: boolean;
};

export const DEFAULT_SETTINGS: FocusSettings = {
  focus: 25,
  short: 5,
  long: 15,
  sessionsUntilLong: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
  chimeSound: "classic",
  hydrationEnabled: true,
  hydrationIntervalMin: 30,
  waterGoal: 8,
  dailyGoalHours: 4,
  todoGoogleSync: false,
};

/** Coerce arbitrary stored/remote data into a valid, clamped settings object. */
export function normalizeSettings(raw: unknown): FocusSettings {
  const r = (raw ?? {}) as Partial<Record<keyof FocusSettings, unknown>>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  return {
    focus: num(r.focus, DEFAULT_SETTINGS.focus, 1, 120),
    short: num(r.short, DEFAULT_SETTINGS.short, 1, 60),
    long: num(r.long, DEFAULT_SETTINGS.long, 1, 60),
    sessionsUntilLong: num(r.sessionsUntilLong, DEFAULT_SETTINGS.sessionsUntilLong, 2, 12),
    autoStartBreaks: bool(r.autoStartBreaks, DEFAULT_SETTINGS.autoStartBreaks),
    autoStartFocus: bool(r.autoStartFocus, DEFAULT_SETTINGS.autoStartFocus),
    soundEnabled: bool(r.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    chimeSound: isSoundId(r.chimeSound) ? r.chimeSound : DEFAULT_SETTINGS.chimeSound,
    hydrationEnabled: bool(r.hydrationEnabled, DEFAULT_SETTINGS.hydrationEnabled),
    hydrationIntervalMin: num(r.hydrationIntervalMin, DEFAULT_SETTINGS.hydrationIntervalMin, 5, 180),
    waterGoal: num(r.waterGoal, DEFAULT_SETTINGS.waterGoal, 1, 20),
    dailyGoalHours: num(r.dailyGoalHours, DEFAULT_SETTINGS.dailyGoalHours, 1, 16),
    todoGoogleSync: bool(r.todoGoogleSync, DEFAULT_SETTINGS.todoGoogleSync),
  };
}
