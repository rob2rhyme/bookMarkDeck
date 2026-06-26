// Build exportable habit data (CSV of the day-by-day log, JSON for backup).
// Pure — mirrors Loop's loved CSV export.

import { toCsv } from "@/utils/download";
import { coerceEntry, coerceHabit } from "@/features/habits/lib/serialize";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const idOf = (x: unknown): string =>
  typeof (x as { id?: unknown })?.id === "string" ? (x as { id: string }).id : "";

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

/**
 * Parse a previously-exported habits JSON back into validated domain objects.
 * Returns null when the text isn't valid JSON or carries no habits/entries.
 * Every record is run through the same coercion the cloud/local loaders use, so
 * malformed entries are dropped rather than trusted.
 */
export function habitsFromJson(
  text: string
): { habits: Habit[]; entries: HabitEntry[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const rawHabits = Array.isArray(d.habits) ? d.habits : [];
  const rawEntries = Array.isArray(d.entries) ? d.entries : [];
  if (rawHabits.length === 0 && rawEntries.length === 0) return null;
  const habits = rawHabits
    .map((h) => coerceHabit(idOf(h), h))
    .filter((h): h is Habit => h !== null && h.id !== "");
  const entries = rawEntries
    .map((e) => coerceEntry(idOf(e), e))
    .filter((e): e is HabitEntry => e !== null && e.id !== "");
  return { habits, entries };
}
