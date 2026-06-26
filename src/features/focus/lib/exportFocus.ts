// Build exportable focus data (CSV for spreadsheets, JSON for backup). Pure —
// no React/Firebase — so it's easy to reason about and test.

import { toCsv } from "@/utils/download";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

const SESSION_COLUMNS = [
  "date",
  "time",
  "focus_min",
  "task",
  "intention",
  "reflection",
];

export function sessionsToCsv(
  sessions: FocusSessionRecord[],
  taskNameById: Record<string, string>
): string {
  const rows = [...sessions]
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .map((s) => ({
      date: s.day,
      time: timeOf(s.createdAt),
      focus_min: s.focusMin,
      task: s.taskId ? taskNameById[s.taskId] ?? "" : "",
      intention: s.intention ?? "",
      reflection: s.reflection ?? "",
    }));
  return toCsv(SESSION_COLUMNS, rows);
}

export function focusToJson(
  sessions: FocusSessionRecord[],
  exportedAt: string
): string {
  return JSON.stringify({ exportedAt, sessions }, null, 2);
}
