// src/features/habits/lib/format.ts
// Small presentational helpers for habit UI.

import { WEEKDAY_LABELS } from "@/features/habits/lib/day";
import type { Habit } from "@/features/habits/lib/types";

export function scheduleLabel(habit: Habit): string {
  const s = habit.schedule;
  if (s.type === "daily") return "Every day";
  if (s.type === "timesPerWeek") return `${s.count}× a week`;
  const days = s.days;
  const eq = (a: number[]) =>
    a.length === days.length && a.every((d) => days.includes(d));
  if (eq([1, 2, 3, 4, 5])) return "Weekdays";
  if (eq([0, 6])) return "Weekends";
  if (eq([0, 1, 2, 3, 4, 5, 6])) return "Every day";
  return days
    .slice()
    .sort()
    .map((d) => WEEKDAY_LABELS[d])
    .join(" · ");
}

/** Accent color for a habit, by hue. `tone` shifts lightness. */
export function hueColor(hue: number, tone: "base" | "soft" | "ring" = "base"): string {
  if (tone === "soft") return `hsl(${hue}, 60%, 22%)`;
  if (tone === "ring") return `hsl(${hue}, 75%, 60%)`;
  return `hsl(${hue}, 70%, 52%)`;
}

export const EMOJI_CHOICES = [
  "✅", "💧", "🏃", "😴", "🧘", "🎯", "📚", "🧠", "✍️", "🙏",
  "🧹", "🍳", "📵", "🥗", "💪", "🚶", "🦷", "💊", "🌱", "☀️",
  "🎸", "🎨", "💰", "📝", "🛏️", "🚭", "🧴", "🐟",
];

export const HUE_CHOICES = [200, 150, 250, 170, 220, 30, 270, 45, 0, 320, 100, 190];
