"use client";

import { REPEAT_LABEL, TODO_REPEATS } from "@/features/focus/lib/recurrence";
import type { TodoPriority, TodoRepeat } from "@/features/focus/lib/types";

type TodoOptionsProps = {
  /** A repeat anchors on the due date, so it is offered only once one is set. */
  hasDue: boolean;
  repeat: TodoRepeat | null;
  priority: TodoPriority | null;
  onRepeat: (v: TodoRepeat | null) => void;
  onPriority: (v: TodoPriority | null) => void;
};

const PRIORITIES: { key: TodoPriority; label: string; on: string }[] = [
  { key: "high", label: "⚑ High", on: "border-amber-400 bg-amber-500/20 text-amber-200" },
  { key: "low", label: "Low", on: "border-slate-400 bg-slate-700/60 text-slate-200" },
];

/** Priority and repeat for the to-do being added or edited. */
export function TodoOptions({ hasDue, repeat, priority, onRepeat, onPriority }: TodoOptionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex gap-1" role="group" aria-label="Priority">
        {PRIORITIES.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={priority === p.key}
            onClick={() => onPriority(priority === p.key ? null : p.key)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              priority === p.key
                ? p.on
                : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {hasDue && (
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span aria-hidden="true">↻</span>
          <select
            value={repeat ?? ""}
            onChange={(e) => onRepeat((e.target.value || null) as TodoRepeat | null)}
            aria-label="Repeat"
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-blue-400 focus:outline-none"
          >
            <option value="">Doesn&rsquo;t repeat</option>
            {TODO_REPEATS.map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
