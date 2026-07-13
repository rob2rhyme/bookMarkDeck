"use client";

// Backfill a focus session for a past day — a date + minutes (+ optional task),
// so a missed day still counts toward streaks and the analysis charts.

import { useEffect, useState } from "react";

import { DateInput } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";
import type { FocusTask } from "@/features/focus/lib/types";

type LogPastSessionModalProps = {
  open: boolean;
  onClose: () => void;
  today: string; // local YYYY-MM-DD, the default + max date
  tasks: FocusTask[]; // selectable tasks to attribute the time to
  onSave: (focusMin: number, day: string, taskId: string | null) => void;
};

export function LogPastSessionModal({
  open,
  onClose,
  today,
  tasks,
  onSave,
}: LogPastSessionModalProps) {
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(25);
  const [taskId, setTaskId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setMinutes(25);
    setTaskId("");
  }, [open, today]);

  const day = date || today;
  const valid = Boolean(day) && minutes >= 1;

  const save = () => {
    if (!valid) return;
    onSave(Math.round(minutes), day, taskId || null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="log-session-title"
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2
        id="log-session-title"
        className="text-lg font-semibold tracking-tight text-slate-50"
      >
        Log a past session
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Add focus time you did but didn&apos;t track — it counts toward your
        streak and charts.
      </p>

      <label className="mt-4 block text-xs text-slate-400">
        Date
        <DateInput
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value || today)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </label>

      <label className="mt-3 block text-xs text-slate-400">
        Minutes focused
        <input
          type="number"
          min={1}
          max={1440}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </label>

      {tasks.length > 0 && (
        <label className="mt-3 block text-xs text-slate-400">
          Task (optional)
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
          >
            <option value="">No task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.text}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add session
        </button>
      </div>
    </Modal>
  );
}

export default LogPastSessionModal;
