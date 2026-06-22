// src/features/habits/lib/focusLink.ts
//
// When you launch a focus session from a habit, we stash a lightweight link
// (habit id + time + day) in localStorage. The habits page reconciles it against
// focus sessions: if a session was completed today after the link, the habit is
// auto-checked. Decoupled — focus never imports habits; habits reads focus.

import { todayKey } from "@/features/habits/lib/day";

const KEY = "bd:habit-focus-link:v1";

export type HabitFocusLink = { habitId: string; at: string; day: string };

export function setHabitFocusLink(habitId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ habitId, at: new Date().toISOString(), day: todayKey() })
    );
  } catch {
    /* ignore */
  }
}

export function peekHabitFocusLink(): HabitFocusLink | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.habitId === "string" ? v : null;
  } catch {
    return null;
  }
}

export function clearHabitFocusLink(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
