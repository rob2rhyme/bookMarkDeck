// src/features/habits/lib/serialize.ts
//
// Pure coercion from untrusted data (Firestore docs OR localStorage JSON) into
// the domain types. Shared so the cloud mapping and the local cache can't drift.

import type {
  EntryStatus,
  Habit,
  HabitEntry,
  HabitSchedule,
  HabitType,
} from "@/features/habits/lib/types";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function normalizeSchedule(raw: unknown): HabitSchedule {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.type === "weekdays") {
    const days = Array.isArray(r.days)
      ? Array.from(
          new Set(
            r.days
              .map((d) => num(d, -1))
              .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          )
        ).sort()
      : [];
    return { type: "weekdays", days: days.length ? days : [1, 2, 3, 4, 5] };
  }
  if (r.type === "timesPerWeek") {
    return { type: "timesPerWeek", count: Math.min(7, Math.max(1, Math.round(num(r.count, 3)))) };
  }
  return { type: "daily" };
}

export function coerceHabit(id: string, raw: unknown): Habit | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name).trim();
  if (!name) return null;
  const type: HabitType = r.type === "measurable" ? "measurable" : "binary";
  return {
    id,
    name,
    emoji: str(r.emoji) || "✅",
    hue: Math.min(360, Math.max(0, Math.round(num(r.hue, 200)))),
    type,
    unit: typeof r.unit === "string" ? r.unit : undefined,
    target: type === "measurable" ? Math.max(1, Math.round(num(r.target, 1))) : undefined,
    step: type === "measurable" ? Math.max(1, Math.round(num(r.step, 1))) : undefined,
    schedule: normalizeSchedule(r.schedule),
    identity: typeof r.identity === "string" ? r.identity : undefined,
    reminder: typeof r.reminder === "string" ? r.reminder : null,
    archived: Boolean(r.archived),
    sortOrder: num(r.sortOrder, 0),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : null,
  };
}

export function coerceEntry(id: string, raw: unknown): HabitEntry | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const habitId = str(r.habitId).trim();
  const day = str(r.day).trim();
  if (!habitId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const status: EntryStatus = r.status === "skipped" ? "skipped" : "done";
  return {
    id,
    habitId,
    day,
    status,
    count: Math.max(0, num(r.count, status === "done" ? 1 : 0)),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : null,
  };
}

/** Plain JSON payload for Firestore / localStorage (drops undefined). */
export function habitToDoc(h: Habit): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    name: h.name,
    emoji: h.emoji,
    hue: h.hue,
    type: h.type,
    schedule: h.schedule,
    archived: h.archived,
    sortOrder: h.sortOrder,
    reminder: h.reminder ?? null,
  };
  if (h.unit !== undefined) doc.unit = h.unit;
  if (h.target !== undefined) doc.target = h.target;
  if (h.step !== undefined) doc.step = h.step;
  if (h.identity !== undefined) doc.identity = h.identity;
  if (h.createdAt) doc.createdAt = h.createdAt;
  return doc;
}
