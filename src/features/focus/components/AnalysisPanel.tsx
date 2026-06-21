"use client";

import { useEffect, useMemo, useState } from "react";

import { MoodIcon } from "@/features/focus/components/MoodIcon";
import { Skeleton } from "@/components/Skeleton";
import { type MoodKey } from "@/features/focus/lib/mood";

type AnalysisPanelProps = {
  available: boolean;
  loaded: boolean;
  todayFocusMin: number;
  todaySessions: number;
  dailyGoalHours: number;
  streak: number;
  totalSessions: number;
  totalFocusMin: number;
  last7: { key: string; label: string; sessions: number; isToday: boolean }[];
  weekLabel: string;
  isCurrentWeek: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek: () => void;
  weekFocusMin: number;
  prevWeekFocusMin: number;
  weekSessions: number;
  weekTaskMin: Record<string, number>;
  taskNameById: Record<string, string>;
  moodByDay: Record<string, MoodKey>;
};

function hours(min: number) {
  return Math.round((min / 60) * 10) / 10;
}

export function AnalysisPanel({
  available,
  loaded,
  todayFocusMin,
  todaySessions,
  dailyGoalHours,
  streak,
  totalSessions,
  totalFocusMin,
  last7,
  weekLabel,
  isCurrentWeek,
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  weekFocusMin,
  prevWeekFocusMin,
  weekSessions,
  weekTaskMin,
  taskNameById,
  moodByDay,
}: AnalysisPanelProps) {
  const maxSessions = Math.max(1, ...last7.map((d) => d.sessions));
  const goalMin = dailyGoalHours * 60;
  const goalPct = Math.min(100, Math.round((todayFocusMin / goalMin) * 100));

  // Average session length across all completed sessions (all-time).
  const avgSessionMin =
    totalSessions > 0 ? Math.round(totalFocusMin / totalSessions) : 0;

  // Week-vs-week change in focus hours (visible week vs the prior 7 days).
  const weekDeltaMin = weekFocusMin - prevWeekFocusMin;
  const hasWeekHistory = weekFocusMin > 0 || prevWeekFocusMin > 0;

  // "On track for today's goal": compare progress against an expected pace over
  // an 8am–10pm active window. Gated behind mount so the time-of-day read never
  // causes a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pace = useMemo(() => {
    if (!mounted || goalMin <= 0 || goalPct >= 100) return null;
    const now = new Date();
    const START = 8;
    const END = 22;
    const hourFloat = now.getHours() + now.getMinutes() / 60;
    const frac = Math.min(1, Math.max(0, (hourFloat - START) / (END - START)));
    if (frac <= 0) return null; // before the active window — nothing expected yet
    return { ahead: todayFocusMin >= goalMin * frac };
  }, [mounted, goalMin, goalPct, todayFocusMin]);

  const topWeekTasks = useMemo(
    () =>
      Object.entries(weekTaskMin)
        .map(([id, min]) => ({
          id,
          name: taskNameById[id] ?? "Removed task",
          min,
        }))
        .sort((a, b) => b.min - a.min)
        .slice(0, 3),
    [weekTaskMin, taskNameById]
  );

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Daily analysis
      </h3>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
          Sign in to sync to see your daily goal, streak, history, and time per
          task.
        </p>
      ) : !loaded ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-2.5">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Today's goal */}
          <div className="rounded-xl bg-slate-950/50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-300">Today</span>
              <span className="text-sm tabular-nums text-slate-400">
                {hours(todayFocusMin)}h / {dailyGoalHours}h · {todaySessions}{" "}
                {todaySessions === 1 ? "session" : "sessions"}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  goalPct >= 100 ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${goalPct}%` }}
              />
            </div>
            {goalPct >= 100 ? (
              <p className="mt-2 text-xs font-medium text-emerald-300">
                ✓ Daily goal reached.
              </p>
            ) : (
              pace && (
                <p
                  className={`mt-2 text-xs font-medium ${
                    pace.ahead ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {pace.ahead
                    ? "On track for today's goal"
                    : "Behind today's pace"}
                </p>
              )
            )}
          </div>

          {/* Streak + totals */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { label: "Day streak", value: `${streak}${streak > 0 ? " 🔥" : ""}` },
              { label: "Total sessions", value: String(totalSessions) },
              { label: "Focus hours", value: String(hours(totalFocusMin)) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-950/50 px-3 py-3">
                <p className="text-[11px] text-slate-500">{s.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
          {totalSessions > 0 && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Avg session {avgSessionMin} min
            </p>
          )}

          {/* 7-day chart + mood trend (navigable into the past) */}
          <div className="mb-2 mt-6 flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              {isCurrentWeek ? "Last 7 days" : weekLabel}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrevWeek}
                aria-label="Previous week"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
              >
                ‹
              </button>
              {!isCurrentWeek && (
                <button
                  type="button"
                  onClick={onResetWeek}
                  className="rounded-md border border-slate-700 px-2 text-[11px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                >
                  This week
                </button>
              )}
              <button
                type="button"
                onClick={onNextWeek}
                disabled={isCurrentWeek}
                aria-label="Next week"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>
          <div className="flex h-24 items-end gap-2">
            {last7.map((d) => {
              const h = Math.round((d.sessions / maxSessions) * 100);
              const mood = moodByDay[d.key];
              return (
                <div
                  key={d.key}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={`${d.sessions} session${
                        d.sessions === 1 ? "" : "s"
                      }`}
                      className={`w-full rounded ${
                        d.sessions > 0
                          ? d.isToday
                            ? "bg-blue-500"
                            : "bg-blue-500/40"
                          : "bg-slate-800"
                      }`}
                      style={{
                        height: `${Math.max(h, d.sessions > 0 ? 8 : 4)}%`,
                      }}
                    />
                  </div>
                  <span className="flex h-4 items-center justify-center leading-none">
                    {mood && <MoodIcon mood={mood} className="h-4 w-4" />}
                  </span>
                  <span
                    className={`text-[11px] ${
                      d.isToday ? "font-medium text-slate-200" : "text-slate-500"
                    }`}
                  >
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Weekly summary */}
          <div className="mt-6 flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              {isCurrentWeek ? "This week" : "That week"}
            </p>
            <span className="text-xs tabular-nums text-slate-400">
              {hours(weekFocusMin)}h · {weekSessions}{" "}
              {weekSessions === 1 ? "session" : "sessions"}
            </span>
          </div>
          {hasWeekHistory && weekDeltaMin !== 0 && (
            <p
              className={`mt-1 text-[11px] tabular-nums ${
                weekDeltaMin > 0 ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {weekDeltaMin > 0 ? "▲" : "▼"} {hours(Math.abs(weekDeltaMin))}h vs
              prior week
            </p>
          )}
          {topWeekTasks.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {topWeekTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate text-slate-300">{t.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {hours(t.min)}h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default AnalysisPanel;
