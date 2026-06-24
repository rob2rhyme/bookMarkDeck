"use client";

// Backfill editor for a single (usually past) day, shown under the Consistency
// calendar when a day is selected. Lists the habits scheduled that day (plus any
// already logged, plus an opt-in "all habits") with quick Done/Skip/count
// controls wired to useHabits.logEntryFor — so missed days can be filled in.

import { useState } from "react";

import { Emoji } from "@/components/icons";
import { habitEmoji } from "@/features/habits/lib/format";
import { isDueOn } from "@/features/habits/lib/streak";
import { type Habit, type HabitEntry, habitTarget } from "@/features/habits/lib/types";

type LogDetail = {
  status: "done" | "skipped" | "clear";
  count?: number;
};

type DayLogEditorProps = {
  habits: Habit[]; // active
  entries: HabitEntry[];
  day: string;
  today: string;
  onLog: (habit: Habit, day: string, detail: LogDetail) => void;
};

export function DayLogEditor({
  habits,
  entries,
  day,
  today,
  onLog,
}: DayLogEditorProps) {
  const [showAll, setShowAll] = useState(false);

  const byHabit = new Map<string, HabitEntry>();
  for (const e of entries) {
    if (e.day === day) byHabit.set(e.habitId, e);
  }

  const scheduled = habits.filter(
    (h) => isDueOn(h, day) || byHabit.has(h.id)
  );
  const others = habits.filter((h) => !scheduled.includes(h));
  const rows = showAll ? [...scheduled, ...others] : scheduled;

  if (habits.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        Log for this day
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          Nothing was scheduled this day.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800/50">
          {rows.map((habit) => {
            const e = byHabit.get(habit.id);
            const target = habitTarget(habit);
            const measurable = habit.type === "measurable";
            const count = e?.status === "done" ? e.count : 0;
            const done = e?.status === "done" && e.count >= target;
            const skipped = e?.status === "skipped";
            const step = habit.step ?? 1;

            return (
              <li key={habit.id} className="flex items-center gap-2 py-1.5">
                <span aria-hidden="true" className="shrink-0">
                  <Emoji>{habitEmoji(habit)}</Emoji>
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                  {habit.name}
                  {measurable && (count > 0 || done) ? (
                    <span className="ml-1 text-[11px] tabular-nums text-slate-500">
                      {count}/{target}
                    </span>
                  ) : null}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {measurable ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Decrease ${habit.name} on ${day}`}
                        onClick={() => {
                          const next = Math.max(0, count - step);
                          onLog(
                            habit,
                            day,
                            next <= 0
                              ? { status: "clear" }
                              : { status: "done", count: next }
                          );
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label={`Increase ${habit.name} on ${day}`}
                        onClick={() =>
                          onLog(habit, day, {
                            status: "done",
                            count: count + step,
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500"
                      >
                        +
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={done}
                      onClick={() =>
                        onLog(habit, day, {
                          status: done ? "clear" : "done",
                        })
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                        done
                          ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40"
                          : "border border-slate-700 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      {done ? "✓ Done" : "Done"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={skipped}
                    onClick={() =>
                      onLog(habit, day, {
                        status: skipped ? "clear" : "skipped",
                      })
                    }
                    className={`rounded-full px-2 py-1 text-[11px] transition ${
                      skipped
                        ? "bg-slate-700 text-slate-200"
                        : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"
                    }`}
                  >
                    {skipped ? "Skipped" : "Skip"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {others.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-[11px] text-slate-500 transition hover:text-slate-300"
        >
          {showAll ? "Hide other habits" : `Show all habits (${others.length} more)`}
        </button>
      )}
      {day === today && (
        <p className="mt-2 text-[10px] text-slate-600">
          Tip: today is easier to log from the Today list above.
        </p>
      )}
    </div>
  );
}

export default DayLogEditor;
