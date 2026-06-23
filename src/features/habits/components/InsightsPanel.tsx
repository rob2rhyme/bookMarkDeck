"use client";

import { useMemo, useState } from "react";

import { ContributionsCalendar } from "@/features/focus/components/ContributionsCalendar";
import { habitEmoji, hueColor } from "@/features/habits/lib/format";
import { weekdayPattern, weeklyBars } from "@/features/habits/lib/insights";
import type { Habit, HabitEntry, HabitStats } from "@/features/habits/lib/types";

type InsightsPanelProps = {
  habits: Habit[]; // active
  statsByHabit: Map<string, HabitStats>;
  entries: HabitEntry[];
  dayCounts: Map<string, number>;
  today: string;
  selectedDay: string;
  onSelectDay: (day: string) => void;
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">{value}</p>
    </div>
  );
}

export function InsightsPanel({
  habits,
  statsByHabit,
  entries,
  dayCounts,
  today,
  selectedDay,
  onSelectDay,
}: InsightsPanelProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const overall = useMemo(() => {
    let active = 0;
    let best = 0;
    let total = 0;
    for (const h of habits) {
      const s = statsByHabit.get(h.id);
      if (!s) continue;
      if (s.currentStreak > 0) active++;
      best = Math.max(best, s.longestStreak, s.currentStreak);
      total += s.totalDone;
    }
    return { active, best, total, count: habits.length };
  }, [habits, statsByHabit]);

  const { bars, rangeLabel } = useMemo(
    () => (today ? weeklyBars(habits, entries, today, weekOffset) : { bars: [], rangeLabel: "" }),
    [habits, entries, today, weekOffset]
  );
  const pattern = useMemo(
    () => (today ? weekdayPattern(habits, entries, today) : []),
    [habits, entries, today]
  );

  const perHabit = useMemo(
    () =>
      habits
        .map((h) => ({ h, s: statsByHabit.get(h.id) }))
        .filter((x): x is { h: Habit; s: HabitStats } => Boolean(x.s))
        .sort((a, b) => b.s.rate - a.s.rate),
    [habits, statsByHabit]
  );

  // Selected-day detail (with notes/time).
  const dayDetail = useMemo(() => {
    if (!selectedDay) return [];
    const byId = new Map(habits.map((h) => [h.id, h]));
    return entries
      .filter((e) => e.day === selectedDay && (e.status === "done" || e.note))
      .map((e) => ({ habit: byId.get(e.habitId), entry: e }))
      .filter((x): x is { habit: Habit; entry: HabitEntry } => Boolean(x.habit));
  }, [selectedDay, entries, habits]);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Analysis
      </h3>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile label="Habits" value={String(overall.count)} />
        <Tile label="Active streaks" value={`${overall.active}${overall.active ? " 🔥" : ""}`} />
        <Tile label="Best streak" value={String(overall.best)} />
        <Tile label="Total check-ins" value={String(overall.total)} />
      </div>

      {/* Weekly completion chart */}
      <div className="mb-2 mt-6 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {weekOffset === 0 ? "This week" : rangeLabel}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            ‹
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-md border border-slate-700 px-2 text-[11px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              This week
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset === 0}
            aria-label="Next week"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
      <div className="flex h-28 items-end gap-2">
        {bars.map((b) => (
          <div key={b.key} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <div
                title={b.future ? "Upcoming" : `${b.done}/${b.due} done · ${b.pct}%`}
                className={`w-full rounded ${
                  b.future
                    ? "bg-slate-800/40"
                    : b.pct >= 100 && b.due > 0
                      ? "bg-emerald-500"
                      : b.isToday
                        ? "bg-blue-500"
                        : "bg-blue-500/40"
                }`}
                style={{ height: `${Math.max(b.future ? 0 : 4, b.pct)}%` }}
              />
            </div>
            <span
              className={`text-[11px] ${
                b.isToday ? "font-medium text-slate-200" : "text-slate-500"
              }`}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>

      {/* Weekday pattern */}
      <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-slate-500">
        Best days (last 12 weeks)
      </p>
      <div className="flex items-end gap-2">
        {pattern.map((p) => (
          <div key={p.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-slate-500">{p.pct}%</span>
            <div className="flex h-16 w-full items-end">
              <div
                className="w-full rounded bg-violet-500/50"
                style={{ height: `${Math.max(4, p.pct)}%` }}
                title={`${p.label}: ${p.pct}%`}
              />
            </div>
            <span className="text-[11px] text-slate-500">{p.label[0]}</span>
          </div>
        ))}
      </div>

      {/* Per-habit breakdown */}
      {perHabit.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-slate-500">
            By habit (30-day rate)
          </p>
          <div className="flex flex-col gap-2.5">
            {perHabit.map(({ h, s }) => (
              <div key={h.id} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center text-base" aria-hidden="true">
                  {habitEmoji(h)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-slate-200">{h.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {s.rate}% · 🔥 {s.currentStreak}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${s.rate}%`, background: hueColor(h.hue, "ring") }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Consistency heatmap + selected-day detail */}
      <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-slate-500">
        Consistency
      </p>
      <ContributionsCalendar counts={dayCounts} selected={selectedDay} onSelect={onSelectDay} />
      {selectedDay && (
        <div className="mt-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
          <p className="text-xs font-medium text-slate-300">{selectedDay}</p>
          {dayDetail.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-500">No habits logged this day.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {dayDetail.map(({ habit, entry }) => (
                <li key={entry.id} className="text-[12px] text-slate-300">
                  <span aria-hidden="true">{habitEmoji(habit)}</span>{" "}
                  <span className={entry.status === "skipped" ? "text-slate-500 line-through" : ""}>
                    {habit.name}
                  </span>
                  {entry.at ? <span className="text-slate-500"> · {entry.at}</span> : null}
                  {entry.note ? (
                    <span className="text-slate-400"> — {entry.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default InsightsPanel;
