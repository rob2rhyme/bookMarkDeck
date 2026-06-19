"use client";

import { useState } from "react";

import { Check, X } from "@/components/icons";
import { useSessionTasks } from "@/features/focus/hooks/useSessionTasks";

type SessionTasksProps = {
  email?: string | null;
  connected?: boolean;
};

export function SessionTasks({ email, connected }: SessionTasksProps) {
  const { tasks, doneCount, addTask, toggleTask, removeTask } = useSessionTasks(
    email,
    connected
  );
  const [draft, setDraft] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    addTask(draft);
    setDraft("");
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-sm sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          This session
        </h3>
        {tasks.length > 0 && (
          <span className="text-xs text-slate-500">
            {doneCount}/{tasks.length} done
          </span>
        )}
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task for this session"
          aria-label="Add a task for this session"
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
        {tasks.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
            What will you work on this session?
          </li>
        ) : (
          tasks.map((task) => (
            <li
              key={task.id}
              className="group flex items-center gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                aria-pressed={task.done}
                aria-label={
                  task.done ? "Mark task as not done" : "Mark task as done"
                }
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                  task.done
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-slate-600 text-transparent hover:border-slate-400"
                }`}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <span
                className={`flex-1 text-sm ${
                  task.done
                    ? "text-slate-500 line-through"
                    : "text-slate-100"
                }`}
              >
                {task.text}
              </span>
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                aria-label="Remove task"
                className="text-slate-600 opacity-0 transition hover:text-slate-300 focus:opacity-100 group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default SessionTasks;
