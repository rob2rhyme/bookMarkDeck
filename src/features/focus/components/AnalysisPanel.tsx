"use client";

import { useEffect, useMemo, useState } from "react";

import { MoodIcon } from "@/features/focus/components/MoodIcon";
import { MilestoneBadges } from "@/features/focus/components/MilestoneBadges";
import { Skeleton } from "@/components/Skeleton";
import {
  MOOD_BY_KEY,
  MOOD_SCORE,
  type MoodKey,
} from "@/features/focus/lib/mood";
import type { FocusSessionRecord } from "@/features/focus/lib/types";
import { EMPTY_STATE_CLASS } from "@/components/ui/EmptyState";

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
  weekBookmarkMin: Record<string, { focusMin: number; title: string }>;
  taskNameById: Record<string, string>;
  moodByDay: Record<string, MoodKey>;
  sessions: FocusSessionRecord[];
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
  weekBookmarkMin,
  taskNameById,
  moodByDay,
  sessions,
}: AnalysisPanelProps) {
  // Tapped day in the 7-day chart — reveals its detail below (touch-friendly).
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Tapped hour in the focus-rhythm chart — reveals its minutes below.
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
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

  const topWeekBookmarks = useMemo(
    () =>
      Object.entries(weekBookmarkMin)
        .map(([id, v]) => ({ id, name: v.title || "Resource", min: v.focusMin }))
        .sort((a, b) => b.min - a.min)
        .slice(0, 3),
    [weekBookmarkMin]
  );

  // Mood trend across the same 7 days. Each logged day becomes a point (x = the
  // bar's column centre, y = its valence score). Consecutive logged days are
  // joined into line segments; missing days create gaps. The SVG viewBox is
  // 0..100 × 0..36 and stretches to fit (non-scaling strokes keep the line crisp).
  const mood = useMemo(() => {
    const n = last7.length || 1;
    const Y_PAD = 5;
    const Y_SPAN = 36 - Y_PAD * 2;
    const points = last7.map((d, i) => {
      const key = moodByDay[d.key];
      if (!key) return null;
      const score = MOOD_SCORE[key];
      return {
        x: ((i + 0.5) / n) * 100,
        y: Y_PAD + (1 - (score - 1) / 8) * Y_SPAN,
        tint: MOOD_BY_KEY[key].tint,
        label: MOOD_BY_KEY[key].label,
      };
    });
    // Break into segments of consecutive present points.
    const segments: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    for (const p of points) {
      if (p) run.push({ x: p.x, y: p.y });
      else if (run.length) {
        segments.push(run);
        run = [];
      }
    }
    if (run.length) segments.push(run);
    const dots = points.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );
    return { segments, dots, hasAny: dots.length > 0 };
  }, [last7, moodByDay]);

  // Focus rhythm — when in the day you focus most (minutes per hour, all-time).
  // `createdAt` is the block's *completion* time, so we treat the block as
  // spanning [completion − focusMin, completion] and spread its minutes across
  // the local hours it actually covered. (Attributing the whole block to the
  // completion hour skews the peak later than reality.)
  const rhythm = useMemo(() => {
    const byHour = new Array(24).fill(0) as number[];
    for (const s of sessions) {
      if (!s.createdAt || s.focusMin <= 0) continue;
      const end = new Date(s.createdAt).getTime();
      let t = end - s.focusMin * 60_000;
      while (t < end) {
        const slice = new Date(t);
        const nextHour = new Date(slice);
        nextHour.setMinutes(60, 0, 0); // top of the next hour
        const sliceEnd = Math.min(end, nextHour.getTime());
        byHour[slice.getHours()] += (sliceEnd - t) / 60_000;
        t = sliceEnd;
      }
    }
    for (let i = 0; i < 24; i++) byHour[i] = Math.round(byHour[i]);
    const max = Math.max(1, ...byHour);
    let peak = 0;
    for (let i = 1; i < 24; i++) if (byHour[i] > byHour[peak]) peak = i;
    return { byHour, max, peak, hasAny: byHour.some((v) => v > 0) };
  }, [sessions]);

  // Recurring intentions across all logged sessions.
  const topIntentions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const t = s.intention?.trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
  }, [sessions]);

  const formatHour = (h: number) => {
    const ampm = h >= 12 ? "pm" : "am";
    const hr = h % 12 || 12;
    return `${hr}${ampm}`;
  };

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Daily analysis
      </h3>

      {!available ? (
        <p className={EMPTY_STATE_CLASS}>
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

          <MilestoneBadges
            streak={streak}
            totalSessions={totalSessions}
            totalFocusMin={totalFocusMin}
          />

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
              const dayMood = moodByDay[d.key];
              const isSel = d.key === selectedDay;
              return (
                <button
                  type="button"
                  key={d.key}
                  aria-label={`${d.label}: ${d.sessions} session${
                    d.sessions === 1 ? "" : "s"
                  }`}
                  aria-pressed={isSel}
                  onClick={() =>
                    setSelectedDay((s) => (s === d.key ? null : d.key))
                  }
                  className="flex h-full flex-1 cursor-pointer flex-col items-center gap-1.5 outline-none"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={`${d.sessions} session${
                        d.sessions === 1 ? "" : "s"
                      }`}
                      className={`w-full rounded transition ${
                        d.sessions > 0
                          ? d.isToday
                            ? "bg-blue-500"
                            : "bg-blue-500/40"
                          : "bg-slate-800"
                      } ${
                        isSel
                          ? "ring-2 ring-blue-200 ring-offset-1 ring-offset-slate-900"
                          : "hover:brightness-125"
                      }`}
                      style={{
                        height: `${Math.max(h, d.sessions > 0 ? 8 : 4)}%`,
                      }}
                    />
                  </div>
                  <span className="flex h-4 items-center justify-center leading-none">
                    {dayMood && <MoodIcon mood={dayMood} className="h-4 w-4" />}
                  </span>
                  <span
                    className={`text-[11px] ${
                      isSel || d.isToday
                        ? "font-medium text-slate-200"
                        : "text-slate-500"
                    }`}
                  >
                    {d.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tapped-bar readout — works on touch, where hover tooltips don't. */}
          <div className="mt-2 flex min-h-[1.25rem] items-center gap-1.5 text-[11px] text-slate-400">
            {(() => {
              const sel = last7.find((d) => d.key === selectedDay);
              if (!sel)
                return (
                  <span className="text-slate-500">
                    Tap a bar to see that day.
                  </span>
                );
              const m = moodByDay[sel.key];
              return (
                <>
                  <span className="font-medium text-slate-200">
                    {sel.label}
                    {sel.isToday ? " (today)" : ""}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums text-blue-300">
                    {sel.sessions}
                  </span>
                  <span>session{sel.sessions === 1 ? "" : "s"}</span>
                  {m && (
                    <>
                      <span>·</span>
                      <MoodIcon mood={m} className="h-3.5 w-3.5" />
                      <span>{MOOD_BY_KEY[m]?.label ?? ""}</span>
                    </>
                  )}
                </>
              );
            })()}
          </div>

          {/* Mood trend line — over the same 7 days. */}
          {mood.hasAny && (
            <div className="mt-4">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                Mood trend
              </p>
              <div className="relative h-9 w-full">
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 100 36"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {mood.segments.map((seg, i) =>
                    seg.length === 1 ? null : (
                      <polyline
                        key={i}
                        points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )
                  )}
                </svg>
                {mood.dots.map((p, i) => (
                  <span
                    key={i}
                    title={p.label}
                    className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ${p.tint}`}
                    style={{ left: `${p.x}%`, top: `${(p.y / 36) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Focus rhythm — minutes of focus by hour of day. */}
          {rhythm.hasAny && (
            <div className="mt-6">
              <div className="mb-1 flex items-baseline justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Focus rhythm
                </p>
                <span className="text-[11px] text-slate-400">
                  peak ~{formatHour(rhythm.peak)}
                </span>
              </div>
              <div className="flex h-12 items-end gap-px">
                {rhythm.byHour.map((min, h) => {
                  const isSel = h === selectedHour;
                  return (
                    <button
                      type="button"
                      key={h}
                      title={`${formatHour(h)} · ${min} min`}
                      aria-label={`${formatHour(h)}: ${min} minutes`}
                      aria-pressed={isSel}
                      onClick={() =>
                        setSelectedHour((s) => (s === h ? null : h))
                      }
                      className={`flex-1 cursor-pointer rounded-sm outline-none transition ${
                        h === rhythm.peak ? "bg-blue-500" : "bg-blue-500/30"
                      } ${isSel ? "ring-2 ring-blue-200" : "hover:brightness-125"}`}
                      style={{ height: `${Math.max((min / rhythm.max) * 100, min > 0 ? 8 : 2)}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                <span>12a</span>
                <span>6a</span>
                <span>12p</span>
                <span>6p</span>
                <span>11p</span>
              </div>
              <div className="mt-1 min-h-[1.25rem] text-[11px] text-slate-400">
                {selectedHour === null ? (
                  <span className="text-slate-500">Tap a bar to see that hour.</span>
                ) : (
                  <span>
                    <span className="font-medium text-slate-200">
                      {formatHour(selectedHour)}
                    </span>{" "}
                    ·{" "}
                    <span className="tabular-nums text-blue-300">
                      {rhythm.byHour[selectedHour]}
                    </span>{" "}
                    min focused
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Top intentions */}
          {topIntentions.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
                Top intentions
              </p>
              <ul className="flex flex-col gap-1.5">
                {topIntentions.map(([intention, count]) => (
                  <li
                    key={intention}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-slate-300">{intention}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      ×{count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
          {topWeekBookmarks.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Top resources
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {topWeekBookmarks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
                      <span aria-hidden="true">🔖</span>
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {hours(b.min)}h
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default AnalysisPanel;
