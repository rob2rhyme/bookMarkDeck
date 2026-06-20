"use client";

import { useEffect, useMemo, useState } from "react";

import { Check, Trash2 } from "@/components/icons";
import { todayKey } from "@/features/focus/data/focusData";
import type { Todo } from "@/features/focus/lib/types";

type TodoListProps = {
  active: Todo[];
  done: Todo[];
  onAdd: (text: string, dueAt: string | null) => void;
  onToggle: (id: string) => void;
  onRemove: (todo: Todo) => void;
};

type Tone = "overdue" | "soon" | "normal";

function remaining(dueAt: string, now: number): { text: string; tone: Tone } {
  const ms = new Date(dueAt).getTime() - now;
  const overdue = ms < 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / 86400000);
  const h = Math.floor((a % 86400000) / 3600000);
  const m = Math.floor((a % 3600000) / 60000);
  const s = Math.floor((a % 60000) / 1000);
  let str: string;
  if (d > 0) str = `${d}d ${h}h`;
  else if (h > 0) str = `${h}h ${m}m`;
  else if (m > 0) str = `${m}m ${s}s`;
  else str = `${s}s`;
  if (overdue) return { text: `Overdue ${str}`, tone: "overdue" };
  return {
    text: `${str} left`,
    tone: a < 3600000 ? "soon" : "normal",
  };
}

const TONE_CLASS: Record<Tone, string> = {
  overdue: "text-red-300",
  soon: "text-amber-300",
  normal: "text-sky-300",
};

function dueTitle(dueAt: string): string {
  const d = new Date(dueAt);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DueBadge({ todo, now }: { todo: Todo; now: number }) {
  if (!todo.dueAt) {
    return <span className="text-xs text-slate-500">No due date</span>;
  }
  const { text, tone } = remaining(todo.dueAt, now);
  return (
    <span
      title={dueTitle(todo.dueAt)}
      className={`text-xs font-medium tabular-nums ${TONE_CLASS[tone]}`}
    >
      {text}
    </span>
  );
}

export function TodoList({
  active,
  done,
  onAdd,
  onToggle,
  onRemove,
}: TodoListProps) {
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second while any item has a due date (for the live countdown).
  const hasDue = active.some((t) => t.dueAt);
  useEffect(() => {
    if (!hasDue) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasDue]);

  const sortedActive = useMemo(
    () =>
      [...active].sort((a, b) => {
        if (a.dueAt && b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        if (a.dueAt) return -1; // dated items first
        if (b.dueAt) return 1;
        return 0;
      }),
    [active]
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft, due ? new Date(due).toISOString() : null);
    setDraft("");
    setDue("");
  };

  const today = todayKey();

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          To-do list
        </h3>
        <span className="text-xs text-slate-500">Unfinished items roll over</span>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a to-do"
          aria-label="Add a to-do"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
        />
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date (optional)"
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-2 text-sm text-slate-300 focus:border-blue-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Add
        </button>
      </form>

      <ul className="mt-4 flex flex-col gap-2">
        {sortedActive.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
            Nothing to do. Add a to-do above — give it a due date for a live
            countdown.
          </li>
        ) : (
          sortedActive.map((todo) => {
            const rolledOver = todo.day && todo.day < today;
            return (
              <li
                key={todo.id}
                className="group flex items-center gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onToggle(todo.id)}
                  aria-label="Mark done"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 transition hover:border-emerald-400"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">
                    {todo.text}
                  </span>
                  <span className="flex items-center gap-2">
                    <DueBadge todo={todo} now={now} />
                    {rolledOver && (
                      <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-medium text-slate-400">
                        rolled over
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(todo)}
                  aria-label="Delete to-do"
                  className="shrink-0 text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      {done.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-300"
          >
            {showDone ? "▾" : "▸"} Done ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {done.map((todo) => (
                <li
                  key={todo.id}
                  className="group flex items-center gap-3 rounded-lg px-3 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onToggle(todo.id)}
                    aria-label="Mark not done"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500 line-through">
                    {todo.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(todo)}
                    aria-label="Delete to-do"
                    className="shrink-0 text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default TodoList;
