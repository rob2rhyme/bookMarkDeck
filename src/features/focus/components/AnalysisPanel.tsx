"use client";

import { useMemo } from "react";

import { MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";

type AnalysisPanelProps = {
  available: boolean;
  todayFocusMin: number;
  todaySessions: number;
  dailyGoalHours: number;
  streak: number;
  totalSessions: number;
  totalFocusMin: number;
  last7: { key: string; label: string; sessions: number; isToday: boolean }[];
  weekFocusMin: number;
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
  todayFocusMin,
  todaySessions,
  dailyGoalHours,
  streak,
  totalSessions,
  totalFocusMin,
  last7,
  weekFocusMin,
  weekSessions,
  weekTaskMin,
  taskNameById,
  moodByDay,
}: AnalysisPanelProps) {
  const maxSessions = Math.max(1, ...last7.map((d) => d.sessions));
  const goalMin = dailyGoalHours * 60;
  const goalPct = Math.min(100, Math.round((todayFocusMin / goalMin) * 100));

  const topWeekTasks = useMemo(
    () =>
      Object.entries(weekTaskMin)
        .map(([id, min]) => ({
          name: taskNameById[id] ?? "Removed task",
          min,
        }))
        .sort((a, b) => b.min - a.min)
        .slice(0, 3),
    [weekTaskMin, taskNameById]
  );

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Daily analysis
      </h3>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Sign in to sync to see your daily goal, streak, history, and time per
          task.
        </p>
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
            {goalPct >= 100 && (
              <p className="mt-2 text-xs font-medium text-emerald-300">
                ✓ Daily goal reached.
              </p>
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

          {/* 7-day chart + mood trend */}
          <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-slate-500">
            Last 7 days
          </p>
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
                  <span className="h-4 text-sm leading-none" title={mood ? MOOD_BY_KEY[mood].label : undefined}>
                    {mood ? MOOD_BY_KEY[mood].emoji : ""}
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
              This week
            </p>
            <span className="text-xs tabular-nums text-slate-400">
              {hours(weekFocusMin)}h · {weekSessions}{" "}
              {weekSessions === 1 ? "session" : "sessions"}
            </span>
          </div>
          {topWeekTasks.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {topWeekTasks.map((t) => (
                <li
                  key={t.name}
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
