// Build + parse exportable focus data (CSV for spreadsheets, JSON for a
// full-fidelity backup that can be re-imported). Pure — no React/Firebase — so
// it's easy to reason about and test.

import { toCsv } from "@/utils/download";
import { isMoodKey, type MoodKey } from "@/features/focus/lib/mood";
import { coerceDreamFields } from "@/features/focus/lib/types";
import type {
  FocusBackup,
  FocusSessionRecord,
  FocusTask,
  JournalNote,
  ScoreRecord,
  Todo,
} from "@/features/focus/lib/types";

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

/** Full backup JSON — sessions, tasks, notes, moods, hydration, to-dos, scores. */
export function focusToJson(data: FocusBackup, exportedAt: string): string {
  return JSON.stringify({ exportedAt, ...data }, null, 2);
}

/* --------------------------------------------------------------- import --- */

const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const numOr = (v: unknown, f: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : f;
const rec = (raw: unknown): Record<string, unknown> =>
  (raw ?? {}) as Record<string, unknown>;

function coerceSession(raw: unknown): FocusSessionRecord | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || !isDay(r.day)) return null;
  return {
    id: r.id,
    focusMin: Math.max(0, Math.round(numOr(r.focusMin, 0))),
    day: r.day,
    taskId: typeof r.taskId === "string" ? r.taskId : null,
    createdAt: strOrNull(r.createdAt),
    ...(str(r.intention).trim() ? { intention: str(r.intention) } : {}),
    ...(str(r.reflection).trim() ? { reflection: str(r.reflection) } : {}),
    ...(typeof r.bookmarkId === "string" ? { bookmarkId: r.bookmarkId } : {}),
    ...(typeof r.bookmarkTitle === "string"
      ? { bookmarkTitle: r.bookmarkTitle }
      : {}),
  };
}

function coerceTask(raw: unknown): FocusTask | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || !str(r.text).trim()) return null;
  return {
    id: r.id,
    text: str(r.text),
    done: Boolean(r.done),
    lastUsedAt: strOrNull(r.lastUsedAt),
  };
}

function coerceNote(raw: unknown): JournalNote | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || !str(r.text).trim() || !isDay(r.day))
    return null;
  return {
    id: r.id,
    day: r.day,
    text: str(r.text),
    createdAt: strOrNull(r.createdAt),
    kind: r.kind === "dream" ? "dream" : "note",
    ...coerceDreamFields(r),
  };
}

function coerceMood(raw: unknown): { day: string; mood: MoodKey } | null {
  const r = rec(raw);
  if (!isDay(r.day) || !isMoodKey(r.mood)) return null;
  return { day: r.day, mood: r.mood };
}

function coerceHydration(raw: unknown): { day: string; cups: number } | null {
  const r = rec(raw);
  const cups = Math.round(numOr(r.cups, 0));
  if (!isDay(r.day) || cups <= 0) return null;
  return { day: r.day, cups };
}

function coerceTodo(raw: unknown): Todo | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || !str(r.text).trim()) return null;
  return {
    id: r.id,
    text: str(r.text),
    note: str(r.note),
    done: Boolean(r.done),
    dueAt: strOrNull(r.dueAt),
    createdAt: strOrNull(r.createdAt),
    day: isDay(r.day) ? r.day : "",
    googleTaskId: typeof r.googleTaskId === "string" ? r.googleTaskId : null,
    googleEventId: typeof r.googleEventId === "string" ? r.googleEventId : null,
  };
}

function coerceScore(raw: unknown): ScoreRecord | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || typeof r.question !== "string") return null;
  return {
    id: r.id,
    topic: str(r.topic) || "general",
    level: str(r.level) || "Easy",
    correct: Boolean(r.correct),
    points: Math.max(0, Math.round(numOr(r.points, 0))),
    question: r.question,
    day: isDay(r.day) ? r.day : "",
    createdAt: strOrNull(r.createdAt),
  };
}

function pick<T>(v: unknown, fn: (x: unknown) => T | null): T[] {
  return (Array.isArray(v) ? v : [])
    .map(fn)
    .filter((x): x is T => x !== null);
}

/**
 * Parse a previously-exported focus JSON back into a validated backup. Returns
 * null when the text isn't valid JSON or carries no recognizable records. Every
 * record is coerced, so malformed ones are dropped rather than trusted.
 */
export function focusFromJson(text: string): FocusBackup | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const backup: FocusBackup = {
    sessions: pick(d.sessions, coerceSession),
    tasks: pick(d.tasks, coerceTask),
    notes: pick(d.notes, coerceNote),
    moods: pick(d.moods, coerceMood),
    hydration: pick(d.hydration, coerceHydration),
    todos: pick(d.todos, coerceTodo),
    scores: pick(d.scores, coerceScore),
  };
  const total =
    backup.sessions.length +
    backup.tasks.length +
    backup.notes.length +
    backup.moods.length +
    backup.hydration.length +
    backup.todos.length +
    backup.scores.length;
  return total > 0 ? backup : null;
}

/** Count of records in a backup — for the import preview. */
export function backupCount(b: FocusBackup): number {
  return (
    b.sessions.length +
    b.tasks.length +
    b.notes.length +
    b.moods.length +
    b.hydration.length +
    b.todos.length +
    b.scores.length
  );
}
