// src/features/habits/lib/templates.ts
//
// Curated starter habits for onboarding + quick-add. Each pre-fills sensible
// defaults so a habit can be created with zero typing.

import type { Habit, HabitSchedule, HabitType } from "@/features/habits/lib/types";

export type HabitTemplate = {
  name: string;
  emoji: string;
  hue: number;
  type: HabitType;
  unit?: string;
  target?: number;
  step?: number;
  schedule: HabitSchedule;
  identity?: string;
  group: "Health" | "Focus" | "Mind" | "Home";
};

export const HABIT_TEMPLATES: HabitTemplate[] = [
  { name: "Drink water", emoji: "💧", hue: 200, type: "measurable", unit: "cups", target: 8, step: 1, schedule: { type: "daily" }, identity: "stay hydrated", group: "Health" },
  { name: "Move my body", emoji: "🏃", hue: 150, type: "binary", schedule: { type: "timesPerWeek", count: 4 }, identity: "be active", group: "Health" },
  { name: "Sleep by 11pm", emoji: "😴", hue: 250, type: "binary", schedule: { type: "daily" }, identity: "be well-rested", group: "Health" },
  { name: "Stretch", emoji: "🧘", hue: 170, type: "binary", schedule: { type: "daily" }, identity: "stay limber", group: "Health" },

  { name: "Deep work block", emoji: "🎯", hue: 220, type: "binary", schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }, identity: "do focused work", group: "Focus" },
  { name: "Plan tomorrow", emoji: "🗒️", hue: 210, type: "binary", schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }, identity: "stay intentional", group: "Focus" },
  { name: "Inbox to zero", emoji: "📥", hue: 200, type: "binary", schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }, identity: "stay on top of things", group: "Focus" },

  { name: "Read", emoji: "📚", hue: 30, type: "measurable", unit: "min", target: 20, step: 5, schedule: { type: "daily" }, identity: "be a reader", group: "Mind" },
  { name: "Meditate", emoji: "🧠", hue: 270, type: "measurable", unit: "min", target: 10, step: 1, schedule: { type: "daily" }, identity: "be calm and present", group: "Mind" },
  { name: "Journal", emoji: "✍️", hue: 45, type: "binary", schedule: { type: "daily" }, identity: "reflect daily", group: "Mind" },
  { name: "Gratitude", emoji: "🙏", hue: 40, type: "binary", schedule: { type: "daily" }, identity: "notice the good", group: "Mind" },

  { name: "Tidy 10 minutes", emoji: "🧹", hue: 190, type: "binary", schedule: { type: "daily" }, identity: "keep a calm space", group: "Home" },
  { name: "Cook at home", emoji: "🍳", hue: 20, type: "binary", schedule: { type: "timesPerWeek", count: 5 }, identity: "eat well", group: "Home" },
  { name: "No phone in bed", emoji: "📵", hue: 0, type: "binary", schedule: { type: "daily" }, identity: "protect my sleep", group: "Home" },
];

/** Build a full Habit from a template (caller supplies id / sortOrder / time). */
export function habitFromTemplate(
  t: HabitTemplate,
  id: string,
  sortOrder: number,
  createdAt: string
): Habit {
  return {
    id,
    name: t.name,
    emoji: t.emoji,
    hue: t.hue,
    type: t.type,
    unit: t.unit,
    target: t.target,
    step: t.step,
    schedule: t.schedule,
    identity: t.identity,
    reminder: null,
    archived: false,
    sortOrder,
    createdAt,
  };
}
