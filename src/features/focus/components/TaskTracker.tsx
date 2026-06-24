"use client";

import { useState } from "react";

import { Check, Pencil, X } from "@/components/icons";
import type { FocusTask } from "@/features/focus/lib/types";

type Bucket = { sessions: number; focusMin: number };

type TaskTrackerProps = {
  activeTasks: FocusTask[];
  doneTasks: FocusTask[];
  activeTaskId: string | null;
  byTask: Record<string, Bucket>;
  onSelect: (id: string) => void;
  onAdd: (text: string) => void;
  onRename: (id: string, text: string) => void;
  onToggleDone: (id: string) => void;
  onRemove: (task: FocusTask) => void;
};

function fmtTime(focusMin: number): string {
  if (focusMin <= 0) return "0m";
  if (focusMin < 60) return `${focusMin}m`;
  return `${Math.round((focusMin / 60) * 10) / 10}h`;
}

export function TaskTracker({
  activeTasks,
  doneTasks,
  activeTaskId,
  byTask,
  onSelect,
  onAdd,
  onRename,
  onToggleDone,
  onRemove,
}: TaskTrackerProps) {
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(draft);
    setDraft("");
  };

  const startEdit = (task: FocusTask) => {
    setEditingId(task.id);
    setEditDraft(task.text);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };
  const commitEdit = () => {
    if (editingId && editDraft.trim()) onRename(editingId, editDraft);
    cancelEdit();
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Tasks
        </h3>
        <span className="text-xs text-slate-500">Pick one to track time</span>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task to work on"
          aria-label="Add a task"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Add
        </button>
      </form>

      <ul className="mt-4 flex flex-col gap-2">
        {activeTasks.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
            No tasks yet. Add one, then start the timer to log time against it.
          </li>
        ) : (
          activeTasks.map((task) => {
            const active = task.id === activeTaskId;
            const stat = byTask[task.id];
            return (
              <li
                key={task.id}
                className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                  active
                    ? "border-blue-400/70 bg-blue-500/10"
                    : "border-slate-800/70 bg-slate-950/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(task.id)}
                  aria-pressed={active}
                  aria-label={active ? "Active task" : "Set as active task"}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                    active
                      ? "border-blue-400 bg-blue-400"
                      : "border-slate-600 hover:border-slate-400"
                  }`}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />}
                </button>

                {editingId === task.id ? (
                  <>
                    <input
                      type="text"
                      value={editDraft}
                      autoFocus
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      aria-label="Edit task"
                      className="min-w-0 flex-1 rounded-md border border-blue-400/70 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={commitEdit}
                      aria-label="Save task"
                      className="shrink-0 text-emerald-400 transition hover:text-emerald-300"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancel edit"
                      className="shrink-0 text-slate-500 transition hover:text-slate-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelect(task.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm text-slate-100">
                        {task.text}
                      </span>
                      {stat && stat.focusMin > 0 && (
                        <span className="text-xs text-slate-500">
                          {fmtTime(stat.focusMin)} · {stat.sessions}{" "}
                          {stat.sessions === 1 ? "session" : "sessions"}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => startEdit(task)}
                      aria-label="Edit task"
                      className="shrink-0 text-slate-600 opacity-0 transition hover:text-blue-300 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDone(task.id)}
                      aria-label="Mark task done"
                      className="shrink-0 text-slate-600 opacity-0 transition hover:text-emerald-300 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(task)}
                      aria-label="Remove task"
                      className="shrink-0 text-slate-600 opacity-0 transition hover:text-slate-300 focus:opacity-100 group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            );
          })
        )}
      </ul>

      {doneTasks.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-300"
          >
            {showDone ? "▾" : "▸"} Done ({doneTasks.length})
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {doneTasks.map((task) => {
                const stat = byTask[task.id];
                return (
                  <li
                    key={task.id}
                    className="group flex items-center gap-3 rounded-lg px-3 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleDone(task.id)}
                      aria-label="Mark task not done"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-500 line-through">
                      {task.text}
                    </span>
                    {stat && stat.focusMin > 0 && (
                      <span className="shrink-0 text-xs text-slate-600">
                        {fmtTime(stat.focusMin)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(task)}
                      aria-label="Remove task"
                      className="shrink-0 text-slate-600 opacity-0 transition hover:text-slate-300 focus:opacity-100 group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskTracker;
