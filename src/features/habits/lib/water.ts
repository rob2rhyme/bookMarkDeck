// Water ↔ Focus-hydration bridge helpers.
//
// The Focus page tracks water as "cups" in focusHydration/{day}; the Habits page
// can track a "Drink water" habit measured in cups. When such a habit exists we
// keep the two in lock-step (1 cup = 1 count). These two surfaces never mount
// together, so the link is maintained through Firestore (when synced) plus a
// best-effort write to Focus's own localStorage cache (so the Focus page shows
// the latest value on its next load, even offline).

import type { Habit } from "@/features/habits/lib/types";

const WATER_UNITS = ["cup", "cups", "glass", "glasses"];

/**
 * A measurable habit counted in cups/glasses whose NAME or identity reads as
 * water/hydration. Deliberately strict: a cup-like unit AND a water-y name —
 * the emoji alone doesn't qualify, so e.g. a 💧-iconed "vape" habit measured in
 * cups won't get mistaken for water and hijack the link.
 */
export function isWaterHabit(habit: Habit): boolean {
  if (habit.type !== "measurable") return false;
  const unit = (habit.unit ?? "").trim().toLowerCase();
  if (!WATER_UNITS.includes(unit)) return false;
  const text = `${habit.name} ${habit.identity ?? ""}`.toLowerCase();
  return /water|hydrat|h2o/.test(text);
}

// Mirrors the shape written by features/focus/hooks/useHydration.ts. Kept here
// (rather than importing Focus internals) so the dependency points one way and
// Focus stays removable.
const FOCUS_HYDRATION_KEY = "bookmarkdeck:focus:hydration:v1";

function cacheKey(email: string | null | undefined): string {
  return email ? `${FOCUS_HYDRATION_KEY}:${email}` : FOCUS_HYDRATION_KEY;
}

/** Best-effort: reflect the water count into Focus's hydration cache for today. */
export function setFocusHydrationCache(
  email: string | null | undefined,
  cups: number
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cacheKey(email),
      JSON.stringify({
        date: new Date().toDateString(),
        cups: Math.max(0, Math.round(cups)),
        lastDrink: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
}

/** Today's cups from Focus's hydration cache, or null. Lets the Habits page
 *  reflect Focus drinks even before/without cloud sync. */
export function getFocusHydrationCache(
  email: string | null | undefined
): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(email));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && d.date === new Date().toDateString() && typeof d.cups === "number") {
      return Math.max(0, Math.round(d.cups));
    }
    return null;
  } catch {
    return null;
  }
}

// Mirrors useFocusSettings' localStorage key/shape. The focus hydration goal is
// the single source of truth for the daily cup target; the linked water habit
// follows it so both pages show the same "/N".
const FOCUS_SETTINGS_KEY = "bookmarkdeck:focus:settings:v1";

/** The Focus daily hydration goal (cups), or null if not set on this device. */
export function getFocusWaterGoal(
  email: string | null | undefined
): number | null {
  if (typeof window === "undefined") return null;
  try {
    const key = email
      ? `${FOCUS_SETTINGS_KEY}:${email}`
      : FOCUS_SETTINGS_KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const goal = Math.round(Number(JSON.parse(raw)?.waterGoal));
    return Number.isFinite(goal) && goal >= 1 && goal <= 20 ? goal : null;
  } catch {
    return null;
  }
}
