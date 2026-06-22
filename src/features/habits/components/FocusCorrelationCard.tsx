"use client";

import { useMemo } from "react";

import type { FocusSessionRecord } from "@/features/focus/lib/types";
import { correlateHabit, focusMinutesByDay } from "@/features/habits/lib/correlate";
import { habitEmoji } from "@/features/habits/lib/format";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

type FocusCorrelationCardProps = {
  habits: Habit[];
  entries: HabitEntry[];
  sessions: FocusSessionRecord[];
  today: string;
};

/** "You focus N% more on days you …" — the bookmarks↔focus↔habits moat. */
export function FocusCorrelationCard({
  habits,
  entries,
  sessions,
  today,
}: FocusCorrelationCardProps) {
  const rows = useMemo(() => {
    if (!today || sessions.length === 0) return [];
    const focusByDay = focusMinutesByDay(sessions);
    return habits
      .map((h) => ({ h, c: correlateHabit(h, entries, focusByDay, today) }))
      .filter(
        (x): x is { h: Habit; c: NonNullable<typeof x.c> } =>
          x.c !== null && x.c.deltaPct !== null && Math.abs(x.c.deltaPct) >= 10
      )
      .sort((a, b) => Math.abs(b.c.deltaPct!) - Math.abs(a.c.deltaPct!))
      .slice(0, 4);
  }, [habits, entries, sessions, today]);

  // Hide entirely until there's at least one focus session to correlate against.
  if (sessions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Habits × Focus
      </h3>
      <p className="mb-4 text-[13px] text-slate-400">
        How your habits line up with your focus time.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-4 text-center text-[13px] text-slate-500">
          Keep logging habits and focus sessions — clear correlations will show
          up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ h, c }) => {
            const up = c.deltaPct! >= 0;
            return (
              <li key={h.id} className="flex items-start gap-3">
                <span className="mt-0.5 text-lg" aria-hidden="true">
                  {habitEmoji(h)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">
                    You focus{" "}
                    <span className={up ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
                      {Math.abs(c.deltaPct!)}% {up ? "more" : "less"}
                    </span>{" "}
                    on days you {h.name.toLowerCase()}.
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-500">
                    {c.doneAvg} min on done days vs {c.missAvg} min otherwise ·{" "}
                    {c.doneDays}/{c.missDays} days
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default FocusCorrelationCard;
