// src/features/habits/lib/areas.ts
//
// Areas (categories) are derived from the habits that carry an `area` label —
// no separate collection. Each area's icon is taken from the first habit in it
// that set one, falling back to a default. Shared by both dashboards + the modal.

import type { Habit } from "@/features/habits/lib/types";

export const DEFAULT_AREA_ICON = "🗂️";

export const AREA_ICON_CHOICES = [
  "🗂️", "💪", "🧠", "💼", "❤️", "🏃", "📚", "🎨",
  "🧘", "💰", "🏠", "🌱", "☀️", "🛌", "🎯", "🤝",
  "🍿", "🍳", "✈️", "🐾",
];

// Keyword → area icon, most specific first; matched as substrings against the
// lower-cased area name. Powers an auto-suggested icon when typing an area like
// "Health", "Home", or "Entertainment".
const AREA_ICON_KEYWORDS: ReadonlyArray<readonly [string[], string]> = [
  [["entertain", "fun", "leisure", "game", "gaming", "movie", "tv", "watch"], "🍿"],
  [["fitness", "exercise", "workout", "gym", "training", "sport"], "💪"],
  [["health", "wellness", "wellbeing", "well-being", "medical"], "❤️"],
  [["food", "cook", "diet", "nutrition", "kitchen", "meal", "eat"], "🍳"],
  [["home", "house", "chore", "household", "clean", "tidy"], "🏠"],
  [["productiv", "focus", "goal", "deep work"], "🎯"],
  [["work", "career", "job", "business", "office"], "💼"],
  [["finance", "money", "budget", "saving", "invest", "wealth"], "💰"],
  [["learn", "study", "education", "school", "reading", "knowledge"], "📚"],
  [["mind", "mental", "mindful"], "🧠"],
  [["meditat", "calm", "spiritual", "faith", "prayer"], "🧘"],
  [["creativ", "art", "music", "hobby", "craft", "design"], "🎨"],
  [["nature", "garden", "outdoor", "plant"], "🌱"],
  [["sleep", "rest", "recovery"], "🛌"],
  [["social", "relationship", "family", "friend", "community"], "🤝"],
  [["travel", "adventure", "trip", "vacation"], "✈️"],
  [["pet", "animal", "dog", "cat"], "🐾"],
  [["run", "jog", "cardio", "walk"], "🏃"],
];

/** Guess a fitting icon from an area name, e.g. "Home" → 🏠. "" when none. */
export function suggestAreaIcon(name: string): string {
  const n = name.toLowerCase();
  for (const [keywords, icon] of AREA_ICON_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return icon;
  }
  return "";
}

export type AreaInfo = { name: string; icon: string };

/** Distinct areas across habits, each with a resolved icon, name-sorted. */
export function deriveAreas(habits: Habit[]): AreaInfo[] {
  const names = new Set<string>();
  const icons = new Map<string, string>();
  for (const h of habits) {
    const name = h.area?.trim();
    if (!name) continue;
    names.add(name);
    const icon = h.areaIcon?.trim();
    if (icon && !icons.has(name)) icons.set(name, icon);
  }
  return [...names]
    .map((name) => ({ name, icon: icons.get(name) ?? DEFAULT_AREA_ICON }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

/** Name → icon lookup (for prefilling the icon when reusing an existing area). */
export function areaIconByName(habits: Habit[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of deriveAreas(habits)) m.set(a.name, a.icon);
  return m;
}
