"use client";

import { useEffect, useState } from "react";

import { BulletButton, NumberButton } from "@/components/BulletButton";
import { DateInput, TimeInput } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";
import { Emoji } from "@/components/icons";
import { appendBullet, appendNumber } from "@/utils/noteFormat";
import { habitEmoji } from "@/features/habits/lib/format";
import { type Habit, type HabitEntry, habitTarget } from "@/features/habits/lib/types";

export type LogDetail = {
  status: "done" | "skipped" | "clear";
  count?: number;
  note?: string;
  at?: string | null;
};

type LogDetailModalProps = {
  open: boolean;
  onClose: () => void;
  habit: Habit | null;
  entry: HabitEntry | null;
  /** Local YYYY-MM-DD for "today" — the default + max selectable date. */
  today: string;
  onSave: (habit: Habit, detail: LogDetail, day: string) => void;
};

export function LogDetailModal({
  open,
  onClose,
  habit,
  entry,
  today,
  onSave,
}: LogDetailModalProps) {
  const [status, setStatus] = useState<"done" | "skipped">("done");
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [at, setAt] = useState("");
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (!open || !habit) return;
    const target = habitTarget(habit);
    setStatus(entry?.status === "skipped" ? "skipped" : "done");
    setCount(entry && entry.status === "done" ? entry.count : target);
    setNote(entry?.note ?? "");
    setAt(entry?.at ?? "");
    setDate(today);
  }, [open, habit, entry, today]);

  if (!habit) return null;
  const measurable = habit.type === "measurable";
  const isBackdated = date !== today;

  const seg = (active: boolean) =>
    `flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
      active
        ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
        : "border-slate-700 text-slate-300 hover:border-slate-500"
    }`;

  const day = date || today;
  const save = () => {
    onSave(
      habit,
      {
        status,
        count: measurable ? Math.max(1, Math.round(count)) : undefined,
        note: note.trim() || undefined,
        at: /^\d{1,2}:\d{2}$/.test(at) ? at : null,
      },
      day
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="habit-log-title"
      panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="habit-log-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-50">
        <Emoji>{habitEmoji(habit)}</Emoji> {habit.name}
      </h2>

      <label className="mt-4 block text-xs text-slate-400">
        Date
        <DateInput
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value || today)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </label>
      {isBackdated && (
        <p className="mt-1 text-[11px] text-amber-300/90">
          Backdating to {date} — set the values for that day.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" className={seg(status === "done")} onClick={() => setStatus("done")}>
          ✓ Done
        </button>
        <button type="button" className={seg(status === "skipped")} onClick={() => setStatus("skipped")}>
          Skip
        </button>
      </div>

      {measurable && status === "done" && (
        <label className="mt-3 block text-xs text-slate-400">
          {habit.unit ?? "Amount"}
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
          />
        </label>
      )}

      <label className="mt-3 block text-xs text-slate-400">
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="How did it go?"
          className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </label>
      <div className="mt-1.5 flex gap-2">
        <BulletButton
          onInsert={() => setNote((n) => appendBullet(n).slice(0, 280))}
        />
        <NumberButton
          onInsert={() => setNote((n) => appendNumber(n).slice(0, 280))}
        />
      </div>

      <label className="mt-3 block text-xs text-slate-400">
        Time (optional)
        <TimeInput
          value={at}
          onChange={(e) => setAt(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </label>

      <div className="mt-6 flex gap-2">
        {(entry || isBackdated) && (
          <button
            type="button"
            onClick={() => {
              onSave(habit, { status: "clear" }, day);
              onClose();
            }}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500"
          >
            Clear
          </button>
        )}
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
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

export default LogDetailModal;
