"use client";

import { useState } from "react";

import { DateInput, TimeInput } from "@/components/DateTimeField";
import { dayKeyFor } from "@/lib/dayKey";

type DueFieldProps = {
  value: string | null; // ISO datetime or null
  onChange: (iso: string | null) => void;
};

function at(addDays: number, hour: number, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

function upcoming(weekday: number, hour: number): string {
  // weekday: 0=Sun … 6=Sat. Next occurrence (today counts only if still ahead).
  const d = new Date();
  const delta = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const PRESETS: { label: string; get: () => string }[] = [
  { label: "This evening", get: () => at(0, 18) },
  { label: "Tomorrow", get: () => at(1, 9) },
  { label: "This weekend", get: () => upcoming(6, 10) },
  { label: "Next week", get: () => upcoming(1, 9) },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toDateInput(iso: string) {
  return dayKeyFor(new Date(iso));
}
function toTimeInput(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DAY_MS = 86400000;
function summarize(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / DAY_MS);
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date} ${time}`;
}

/** A "smart" due-date control: one-tap presets + an optional custom date/time —
 *  no free-text typing required. Returns an ISO string or null. */
export function DueField({ value, onChange }: DueFieldProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(value ? toDateInput(value) : "");
  const [time, setTime] = useState(value ? toTimeInput(value) : "09:00");

  const pick = (iso: string | null) => {
    onChange(iso);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!date) return;
    const iso = new Date(`${date}T${time || "09:00"}`).toISOString();
    pick(iso);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 self-start rounded-lg border px-3 py-2 text-sm transition ${
          value
            ? "border-sky-500/60 bg-sky-950/30 text-sky-200"
            : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
        }`}
      >
        <span aria-hidden="true">📅</span>
        {value ? summarize(value) : "Set due date"}
      </button>

      {open && (
        <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => pick(p.get())}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-sky-400 hover:text-sky-200"
              >
                {p.label}
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition hover:border-red-400 hover:text-red-300"
              >
                No date
              </button>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2.5">
            <DateInput
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Custom due date"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-400 focus:outline-none"
            />
            <TimeInput
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Custom due time"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-200 focus:border-blue-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={!date}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DueField;
