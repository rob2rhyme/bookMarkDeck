"use client";

// Client wrappers for the server-only /api/coach route. Everything returns null
// on failure (including 503 "not configured"), so callers degrade to manual.

import { HUE_CHOICES } from "@/features/habits/lib/format";
import type { Habit, HabitSchedule } from "@/features/habits/lib/types";

export type AiHabit = {
  name: string;
  emoji?: string;
  type?: "binary" | "measurable";
  unit?: string;
  target?: number;
  scheduleType?: "daily" | "weekdays" | "timesPerWeek";
  weekdays?: number[];
  timesPerWeek?: number;
  identity?: string;
};

export async function aiCreateHabit(
  text: string,
  existing: string[]
): Promise<AiHabit | null> {
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "create", text, existing }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.habit && typeof data.habit.name === "string" ? data.habit : null;
  } catch {
    return null;
  }
}

export async function aiWeeklyReview(stats: unknown): Promise<string | null> {
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "review", stats }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.review === "string" && data.review.trim()
      ? data.review
      : null;
  } catch {
    return null;
  }
}

/** Map a loose AI habit into a full, valid Habit draft. */
export function aiToHabit(
  ai: AiHabit,
  id: string,
  sortOrder: number,
  createdAt: string
): Habit {
  const type = ai.type === "measurable" ? "measurable" : "binary";
  let schedule: HabitSchedule = { type: "daily" };
  if (ai.scheduleType === "weekdays") {
    const days = Array.isArray(ai.weekdays)
      ? ai.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    schedule = { type: "weekdays", days: days.length ? days : [1, 2, 3, 4, 5] };
  } else if (ai.scheduleType === "timesPerWeek") {
    schedule = {
      type: "timesPerWeek",
      count: Math.min(7, Math.max(1, Math.round(ai.timesPerWeek ?? 3))),
    };
  }
  const hue = HUE_CHOICES[ai.name.length % HUE_CHOICES.length];
  return {
    id,
    name: ai.name.slice(0, 80),
    emoji: ai.emoji || "✅",
    hue,
    type,
    unit: type === "measurable" ? ai.unit || "x" : undefined,
    target: type === "measurable" ? Math.max(1, Math.round(ai.target ?? 1)) : undefined,
    step: type === "measurable" ? 1 : undefined,
    schedule,
    identity: ai.identity?.slice(0, 80) || undefined,
    reminder: null,
    archived: false,
    sortOrder,
    createdAt,
  };
}
