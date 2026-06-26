// Build exportable habit data (CSV of the day-by-day log, JSON for backup).
// Pure — mirrors Loop's loved CSV export.

import { toCsv } from "@/utils/download";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const ENTRY_COLUMNS = ["date", "habit", "status", "count", "time", "note"];

export function entriesToCsv(habits: Habit[], entries: HabitEntry[]): string {
  const nameById = new Map(habits.map((h) => [h.id, h.name]));
  const rows = [...entries]
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (nameById.get(a.habitId) ?? "").localeCompare(nameById.get(b.habitId) ?? "")
    )
    .map((e) => ({
      date: e.day,
      habit: nameById.get(e.habitId) ?? "",
      status: e.status,
      count: e.count,
      time: e.at ?? "",
      note: e.note ?? "",
    }));
  return toCsv(ENTRY_COLUMNS, rows);
}

export function habitsToJson(
  habits: Habit[],
  entries: HabitEntry[],
  exportedAt: string
): string {
  return JSON.stringify({ exportedAt, habits, entries }, null, 2);
}
