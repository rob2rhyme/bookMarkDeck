// Recurring to-dos. Pure — see recurrence.test.ts.
//
// Completing a repeating to-do leaves it in Done (so the history keeps the
// completion) and files the NEXT one: same text, note, list and project, due on
// the next occurrence after the day it was completed. Missed occurrences are not
// queued up — finishing Monday's chore on Thursday files next week's, not three
// overdue copies.
//
// The next to-do's id is derived from the original and its due day, so two
// devices completing the same one file the same record instead of two.

import { dayKeyFor, todayKey } from "@/lib/dayKey";
import { noteChecklistItems, setNoteItemChecked } from "@/utils/noteFormat";
import type { Todo, TodoRepeat } from "@/features/focus/lib/types";

export const TODO_REPEATS: TodoRepeat[] = ["daily", "weekdays", "weekly", "monthly"];

export const REPEAT_LABEL: Record<TodoRepeat, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const isTodoRepeat = (v: unknown): v is TodoRepeat =>
  typeof v === "string" && (TODO_REPEATS as string[]).includes(v);

/** Bound on the walk: a daily chore left a century is still found, but a bad date never loops forever. */
const MAX_STEPS = 40_000;

function advance(d: Date, repeat: TodoRepeat, anchorDate: number): Date {
  const next = new Date(d);
  switch (repeat) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekdays":
      do next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly": {
      // Keep the original day of the month where the month has it (the 31st
      // lands on the 30th, then back on the 31st), rather than drifting down.
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const last = new Date(y, m + 1, 0).getDate();
      return new Date(
        y,
        m,
        Math.min(anchorDate, last),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds()
      );
    }
  }
}

/**
 * The first occurrence of `dueAt`'s cadence that falls on a local day after
 * `afterDay`. The time of day is kept.
 */
export function nextDueAfter(dueAt: string, repeat: TodoRepeat, afterDay: string): string {
  const anchorDate = new Date(dueAt).getDate();
  let cur = new Date(dueAt);
  for (let i = 0; i < MAX_STEPS; i++) {
    cur = advance(cur, repeat, anchorDate);
    if (dayKeyFor(cur) > afterDay) break;
  }
  return cur.toISOString();
}

/** A copy of the note with every checklist item unticked, ready for the next round. */
function untick(note: string): string {
  let out = note;
  for (const it of noteChecklistItems(note)) {
    if (it.checked) out = setNoteItemChecked(out, it.line, false);
  }
  return out;
}

const baseId = (id: string) => id.split("~")[0];

/**
 * The to-do to file when `todo` is completed at `completedAt`, or null when it
 * doesn't repeat. Deterministic: the same inputs give the same id.
 */
export function nextOccurrence(todo: Todo, completedAt: string): Todo | null {
  if (!todo.repeat || !todo.dueAt) return null;
  const dueAt = nextDueAfter(todo.dueAt, todo.repeat, dayKeyFor(new Date(completedAt)));
  return {
    id: `${baseId(todo.id)}~${dayKeyFor(new Date(dueAt))}`,
    text: todo.text,
    note: untick(todo.note),
    done: false,
    dueAt,
    createdAt: new Date().toISOString(),
    completedAt: null,
    day: todayKey(),
    list: todo.list ?? "personal",
    project: todo.project ?? "",
    googleTaskId: null,
    googleEventId: null,
    repeat: todo.repeat,
    ...(todo.priority ? { priority: todo.priority } : {}),
  };
}

/** Highest priority first; otherwise 0 (callers keep their own order). */
export function priorityRank(todo: Pick<Todo, "priority">): number {
  return todo.priority === "high" ? 0 : todo.priority === "low" ? 2 : 1;
}
