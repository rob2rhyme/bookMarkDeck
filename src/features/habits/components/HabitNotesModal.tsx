"use client";

import { useMemo } from "react";

import { Modal } from "@/components/Modal";
import { NoteText } from "@/components/NoteText";
import { Emoji } from "@/components/icons";
import { WEEKDAY_LABELS, addDays } from "@/features/habits/lib/day";
import { habitEmoji, hueColor } from "@/features/habits/lib/format";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Friendly label for a day key relative to today. */
function dayLabel(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  const wd = WEEKDAY_LABELS[date.getDay()];
  const base = `${wd}, ${MONTHS[m - 1]} ${d}`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${base}, ${y}`;
}

type HabitNotesModalProps = {
  open: boolean;
  onClose: () => void;
  habit: Habit | null;
  /** All entries (any habit); filtered to this habit's noted days inside. */
  entries: HabitEntry[];
  today: string;
};

export function HabitNotesModal({
  open,
  onClose,
  habit,
  entries,
  today,
}: HabitNotesModalProps) {
  const noted = useMemo(() => {
    if (!habit) return [];
    return entries
      .filter((e) => e.habitId === habit.id && e.note?.trim())
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }, [entries, habit]);

  if (!habit) return null;
  const accent = hueColor(habit.hue, "ring");

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="habit-notes-title"
      panelClassName="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2
        id="habit-notes-title"
        className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-50"
      >
        <Emoji>{habitEmoji(habit)}</Emoji> {habit.name}
        <span className="text-sm font-normal text-slate-500">· Notes</span>
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {noted.length === 0
          ? "No notes yet."
          : `${noted.length} note${noted.length === 1 ? "" : "s"} over time.`}
      </p>

      {noted.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
          Jot a note when you log this habit — the “Note / time” button on its
          card — and your reflections will gather here.
        </p>
      ) : (
        <ol className="mt-4 -mr-2 flex flex-col gap-3 overflow-y-auto pr-2">
          {noted.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: e.status === "skipped" ? "#64748b" : accent,
                  }}
                />
                {dayLabel(e.day, today)}
                {e.at ? <span className="text-slate-500">· {e.at}</span> : null}
                {e.status === "skipped" ? (
                  <span className="text-slate-500">· skipped</span>
                ) : null}
              </span>
              <NoteText
                text={e.note ?? ""}
                className="mt-1.5 whitespace-pre-wrap text-sm text-slate-200"
              />
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

export default HabitNotesModal;
