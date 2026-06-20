"use client";

import { useEffect, useMemo, useState } from "react";

import { Check, Pencil, Trash2, X } from "@/components/icons";
import { DueField } from "@/features/focus/components/DueField";
import { RichText } from "@/features/focus/components/RichText";
import { todayKey } from "@/features/focus/data/focusData";
import type { Todo } from "@/features/focus/lib/types";

type TodoListProps = {
  active: Todo[];
  done: Todo[];
  onAdd: (text: string, dueAt: string | null, note: string) => void;
  onToggle: (todo: Todo) => void;
  onEdit: (
    id: string,
    patch: { text?: string; note?: string; dueAt?: string | null }
  ) => void;
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
  return { text: `${str} left`, tone: a < 3600000 ? "soon" : "normal" };
}

const TONE_CLASS: Record<Tone, string> = {
  overdue: "text-red-300",
  soon: "text-amber-300",
  normal: "text-sky-300",
};

function dueTitle(dueAt: string): string {
  return new Date(dueAt).toLocaleString(undefined, {
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
  onEdit,
  onRemove,
}: TodoListProps) {
  const [draft, setDraft] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftDue, setDraftDue] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Inline edit state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDue, setEditDue] = useState<string | null>(null);

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
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return 0;
      }),
    [active]
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft, draftDue, draftNote);
    setDraft("");
    setDraftNote("");
    setDraftDue(null);
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
    setEditNote(todo.note ?? "");
    setEditDue(todo.dueAt);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = () => {
    if (!editText.trim()) return;
    onEdit(editingId!, {
      text: editText,
      note: editNote.trim(),
      dueAt: editDue,
    });
    setEditingId(null);
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

      {/* Add */}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a to-do"
            aria-label="Add a to-do"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Add
          </button>
        </div>
        <textarea
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          placeholder="Add a note or link (optional)"
          rows={2}
          aria-label="To-do note"
          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
        />
        <DueField value={draftDue} onChange={setDraftDue} />
      </form>

      <ul className="mt-4 flex flex-col gap-2">
        {sortedActive.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
            Nothing to do. Add a to-do — give it a due date for a live countdown.
          </li>
        ) : (
          sortedActive.map((todo) => {
            if (editingId === todo.id) {
              return (
                <li
                  key={todo.id}
                  className="flex flex-col gap-2 rounded-lg border border-blue-500/50 bg-slate-950/40 px-3 py-2"
                >
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    aria-label="Edit to-do"
                    autoFocus
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
                  />
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add a note (optional)"
                    rows={2}
                    aria-label="To-do note"
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                  />
                  <DueField value={editDue} onChange={setEditDue} />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
                    >
                      Save
                    </button>
                  </div>
                </li>
              );
            }
            const rolledOver = todo.day && todo.day < today;
            return (
              <li
                key={todo.id}
                className="group flex items-center gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onToggle(todo)}
                  aria-label="Mark done"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 transition hover:border-emerald-400"
                />
                <div className="min-w-0 flex-1">
                  <RichText
                    text={todo.text}
                    className="block truncate text-sm text-slate-100"
                  />
                  {todo.note && (
                    <RichText
                      text={todo.note}
                      className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-slate-400"
                    />
                  )}
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
                  onClick={() => startEdit(todo)}
                  aria-label="Edit to-do"
                  className="shrink-0 text-slate-600 opacity-100 transition sm:opacity-0 hover:text-blue-300 focus:opacity-100 sm:group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(todo)}
                  aria-label="Delete to-do"
                  className="shrink-0 text-slate-600 opacity-100 transition sm:opacity-0 hover:text-red-300 focus:opacity-100 sm:group-hover:opacity-100"
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
                    onClick={() => onToggle(todo)}
                    aria-label="Mark not done"
                    title="Undo — mark not done"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/20 text-emerald-300 transition hover:bg-emerald-500/30"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <RichText
                    text={todo.text}
                    className="min-w-0 flex-1 truncate text-sm text-slate-500 line-through"
                  />
                  <button
                    type="button"
                    onClick={() => onToggle(todo)}
                    className="shrink-0 text-[11px] font-medium text-slate-500 opacity-100 transition sm:opacity-0 hover:text-slate-200 focus:opacity-100 sm:group-hover:opacity-100"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(todo)}
                    aria-label="Delete to-do"
                    className="shrink-0 text-slate-600 opacity-100 transition sm:opacity-0 hover:text-red-300 focus:opacity-100 sm:group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
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
