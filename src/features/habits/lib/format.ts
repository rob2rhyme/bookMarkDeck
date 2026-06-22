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
  "🍷", "🥃", "🍽️", "👨‍👩‍👧‍👦", "🏊", "🥾", "💨", "🦏",
];

export const HUE_CHOICES = [200, 150, 250, 170, 220, 30, 270, 45, 0, 320, 100, 190];

/** The emoji a freshly-created habit gets before the user picks one. */
export const DEFAULT_HABIT_EMOJI = "✅";

// Keyword → emoji, most specific first. Each entry's keywords are matched as
// substrings against the lower-cased habit name; the first hit wins.
const EMOJI_KEYWORDS: ReadonlyArray<readonly [string[], string]> = [
  [["wine"], "🍷"],
  [["whiskey", "whisky", "rum", "vodka", "tequila", "cocktail", "booze", "alcohol", "beer", "drink"], "🥃"],
  [["vape", "vpe", "nicotine", "cigarette", "cigar"], "💨"],
  [["smoke", "smoking"], "🚭"],
  [["gym", "lift", "weight", "strength", "workout"], "💪"],
  [["swim"], "🏊"],
  [["hike", "trek"], "🥾"],
  [["run", "jog", "cardio"], "🏃"],
  [["walk", "steps"], "🚶"],
  [["lunch", "dinner", "breakfast", "meal", "eat", "restaurant", "food", "cook"], "🍽️"],
  [["family", "kids", "partner"], "👨‍👩‍👧‍👦"],
  [["water", "hydrate", "drink water"], "💧"],
  [["read", "book"], "📚"],
  [["meditate", "mindful", "breathe", "stretch", "yoga"], "🧘"],
  [["sleep", "bed", "rest"], "😴"],
  [["journal", "write", "diary"], "✍️"],
  [["pray", "prayer", "gratitude"], "🙏"],
  [["clean", "tidy", "chores"], "🧹"],
  [["pill", "vitamin", "supplement", "med"], "💊"],
  [["floss", "teeth", "brush"], "🦷"],
  [["money", "save", "budget", "invest"], "💰"],
  [["sun", "outdoor", "nature"], "☀️"],
  [["plant", "garden", "grow"], "🌱"],
  [["fish"], "🐟"],
  [["rhino"], "🦏"],
];

/**
 * Guess a fitting emoji from a habit's name, e.g. "Hard Drinks" → 🥃.
 * Returns "" when nothing matches so callers can keep their own default.
 */
export function suggestEmoji(name: string): string {
  const n = name.toLowerCase();
  for (const [keywords, emoji] of EMOJI_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return emoji;
  }
  return "";
}

/**
 * The emoji to actually render for a habit: its chosen emoji, or — when it's
 * still the untouched default — a guess from the name so older habits created
 * before icon-suggestion still show something meaningful.
 */
export function habitEmoji(habit: Habit): string {
  if (habit.emoji && habit.emoji !== DEFAULT_HABIT_EMOJI) return habit.emoji;
  return suggestEmoji(habit.name) || habit.emoji || DEFAULT_HABIT_EMOJI;
}
