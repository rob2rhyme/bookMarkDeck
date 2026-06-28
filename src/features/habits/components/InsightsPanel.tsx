"use client";

import { useMemo, useState } from "react";

import { ContributionsCalendar } from "@/features/focus/components/ContributionsCalendar";
import { ChevronUp, Trash2 } from "@/components/icons";
import { ExpandToggle } from "@/components/ExpandToggle";
import { DayLogEditor } from "@/features/habits/components/DayLogEditor";
import { addDays, dayKeyFor, parseDay } from "@/features/habits/lib/day";
import { habitEmoji, hueColor, scheduleLabel } from "@/features/habits/lib/format";
import {
  type DayState,
  habitMomentum,
  weekdayPattern,
  weeklyBars,
} from "@/features/habits/lib/insights";
import {
  type Habit,
  type HabitEntry,
  type HabitStats,
  habitTarget,
} from "@/features/habits/lib/types";

type InsightsPanelProps = {
  habits: Habit[]; // active
  statsByHabit: Map<string, HabitStats>;
  entries: HabitEntry[];
  dayCounts: Map<string, number>;
  today: string;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onRemoveEntry?: (habit: Habit, entry: HabitEntry) => void;
  onLogEntry?: (
    habit: Habit,
    day: string,
    detail: { status: "done" | "skipped" | "clear"; count?: number }
  ) => void;
  /** When true (default), collapse everything below the summary tiles. */
  collapsible?: boolean;
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">{value}</p>
    </div>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDay(key: string): string {
  const d = parseDay(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** "Wednesday, Jun 24" — full weekday + date for a tapped strip dot. */
function fmtDateDay(key: string): string {
  const d = parseDay(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "HH:MM" (24h) → "7:30 am". Falls back to the raw value. */
function fmtTime(at: string): string {
  const [h, m] = at.split(":").map(Number);
  if (Number.isNaN(h)) return at;
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return `${hr}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

/** "Today" / "Yesterday" / "3 days ago" / "Jun 12" / "Never". */
function relativeDay(day: string | null, today: string): string {
  if (!day) return "Never";
  if (day === today) return "Today";
  const diff = Math.round(
    (parseDay(today).getTime() - parseDay(day).getTime()) / 86400000
  );
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff <= 13) return `${diff} days ago`;
  return fmtDay(day);
}

const STRIP_CLASS: Record<DayState, string> = {
  done: "bg-emerald-500",
  skipped: "bg-slate-600",
  missed: "bg-rose-900/70",
  off: "bg-slate-800/50",
};
const STRIP_LABEL: Record<DayState, string> = {
  done: "Done",
  skipped: "Skipped",
  missed: "Missed",
  off: "Not scheduled",
};

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium tabular-nums text-slate-200">
        {value}
      </dd>
    </div>
  );
}

/** Expandable per-habit detail: cadence, recency, streaks, and a 14-day strip. */
function HabitDetail({
  habit,
  stats,
  entries,
  today,
  onLogEntry,
}: {
  habit: Habit;
  stats: HabitStats;
  entries: HabitEntry[];
  today: string;
  onLogEntry?: (
    habit: Habit,
    day: string,
    detail: { status: "done" | "skipped" | "clear"; count?: number }
  ) => void;
}) {
  const weekly = habit.schedule.type === "timesPerWeek";
  const measurable = habit.type === "measurable";
  const target = habitTarget(habit);

  // Strip pager: 0 = most recent 14 days; each step back is another 14 days.
  const [winOffset, setWinOffset] = useState(0);
  const endDay = addDays(today, -winOffset * 14);
  const m = habitMomentum(habit, entries, today, 14, endDay);
  // Don't let the user page earlier than the habit existed (or ~400d of history).
  const floor = habit.createdAt
    ? dayKeyFor(new Date(habit.createdAt))
    : addDays(today, -400);
  const canOlder = addDays(endDay, -13) > floor;

  // Tap a day in the strip to reveal its date / weekday / logged time, and
  // (for past or today) backdate it done/skipped/clear.
  const [openDot, setOpenDot] = useState<string | null>(null);
  const entryByDay = new Map(
    entries.filter((e) => e.habitId === habit.id).map((e) => [e.day, e])
  );

  return (
    <div className="mt-2 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <DetailStat label="Frequency" value={scheduleLabel(habit)} />
        <DetailStat label="Last done" value={relativeDay(m.lastDoneDay, today)} />
        <DetailStat
          label="Current streak"
          value={`${stats.currentStreak}${stats.currentStreak > 0 ? " 🔥" : ""}`}
        />
        <DetailStat label="Longest streak" value={String(stats.longestStreak)} />
        <DetailStat label="Total done" value={String(stats.totalDone)} />
        {weekly ? (
          <DetailStat
            label="This week"
            value={`${stats.weekDone ?? m.thisWeekDone} / ${stats.weekTarget ?? "?"}`}
          />
        ) : (
          <>
            <DetailStat label="30-day rate" value={`${stats.rate}%`} />
            <DetailStat
              label="This week"
              value={`${m.thisWeekDone} / ${m.thisWeekDue}`}
            />
          </>
        )}
        {measurable && (
          <DetailStat
            label="Today"
            value={`${stats.countToday} / ${target} ${habit.unit ?? ""}`.trim()}
          />
        )}
      </dl>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            {winOffset === 0
              ? "Last 14 days"
              : `${fmtDay(addDays(endDay, -13))} – ${fmtDay(endDay)}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canOlder}
              onClick={() => {
                setOpenDot(null);
                setWinOffset((o) => o + 1);
              }}
              aria-label="Earlier 14 days"
              className="rounded p-0.5 text-slate-400 transition enabled:hover:text-slate-100 disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5 -rotate-90" />
            </button>
            <button
              type="button"
              disabled={winOffset === 0}
              onClick={() => {
                setOpenDot(null);
                setWinOffset((o) => Math.max(0, o - 1));
              }}
              aria-label="Later 14 days"
              className="rounded p-0.5 text-slate-400 transition enabled:hover:text-slate-100 disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5 rotate-90" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {m.strip.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setOpenDot((cur) => (cur === d.key ? null : d.key))}
              aria-pressed={openDot === d.key}
              aria-label={`${fmtDateDay(d.key)} · ${STRIP_LABEL[d.state]}`}
              title={`${fmtDay(d.key)} · ${STRIP_LABEL[d.state]}`}
              className={`h-3.5 w-3.5 rounded-sm ${STRIP_CLASS[d.state]} ${
                openDot === d.key
                  ? "ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-950"
                  : ""
              }`}
            />
          ))}
        </div>
        {openDot &&
          (() => {
            const state =
              m.strip.find((d) => d.key === openDot)?.state ?? "off";
            const e = entryByDay.get(openDot);
            const isDone = state === "done";
            return (
              <div className="mt-2">
                <p className="text-xs text-slate-300">
                  <span className="font-medium text-slate-100">
                    {fmtDateDay(openDot)}
                  </span>
                  {" · "}
                  {STRIP_LABEL[state]}
                  {e?.at ? ` · ${fmtTime(e.at)}` : ""}
                  {measurable && e && e.status === "done"
                    ? ` · ${e.count} ${habit.unit ?? ""}`.trimEnd()
                    : ""}
                </p>
                {onLogEntry && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {!isDone && (
                      <button
                        type="button"
                        onClick={() =>
                          onLogEntry(habit, openDot, {
                            status: "done",
                            count: target,
                          })
                        }
                        className="rounded-full border border-emerald-700/60 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                      >
                        Mark done
                      </button>
                    )}
                    {state !== "skipped" && (
                      <button
                        type="button"
                        onClick={() =>
                          onLogEntry(habit, openDot, { status: "skipped" })
                        }
                        className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-500"
                      >
                        Skip
                      </button>
                    )}
                    {e && (
                      <button
                        type="button"
                        onClick={() =>
                          onLogEntry(habit, openDot, { status: "clear" })
                        }
                        className="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 transition hover:border-rose-700/60 hover:text-rose-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
          {(["done", "missed", "skipped", "off"] as DayState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${STRIP_CLASS[s]}`} />
              {STRIP_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
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
  onRemoveEntry,
  onLogEntry,
  collapsible = true,
}: InsightsPanelProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [openHabitId, setOpenHabitId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
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

      {(!collapsible || expanded) && (
        <>
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
            By habit — tap for detail
          </p>
          <div className="flex flex-col gap-1.5">
            {perHabit.map(({ h, s }) => {
              const open = openHabitId === h.id;
              return (
                <div key={h.id}>
                  <button
                    type="button"
                    onClick={() => setOpenHabitId(open ? null : h.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-slate-800/30"
                  >
                    <span className="w-6 shrink-0 text-center text-base" aria-hidden="true">
                      {habitEmoji(h)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-slate-200">{h.name}</span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-slate-400">
                          {s.rate}% · 🔥 {s.currentStreak}
                          <ChevronUp
                            className={`h-3.5 w-3.5 text-slate-500 transition ${
                              open ? "" : "rotate-180"
                            }`}
                          />
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${s.rate}%`, background: hueColor(h.hue, "ring") }}
                        />
                      </span>
                    </span>
                  </button>
                  {open && (
                    <HabitDetail
                      habit={h}
                      stats={s}
                      entries={entries}
                      today={today}
                      onLogEntry={onLogEntry}
                    />
                  )}
                </div>
              );
            })}
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
          <p className="text-xs font-medium text-slate-300">
            {selectedDay}
            {selectedDay === today ? " · Today" : ""}
          </p>
          {dayDetail.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-500">No habits logged this day.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {dayDetail.map(({ habit, entry }) => (
                <li
                  key={entry.id}
                  className="group flex items-start justify-between gap-2 text-[12px] text-slate-300"
                >
                  <span className="min-w-0">
                    <span aria-hidden="true">{habitEmoji(habit)}</span>{" "}
                    <span className={entry.status === "skipped" ? "text-slate-500 line-through" : ""}>
                      {habit.name}
                    </span>
                    {entry.at ? <span className="text-slate-500"> · {entry.at}</span> : null}
                    {entry.note ? (
                      <span className="text-slate-400"> — {entry.note}</span>
                    ) : null}
                  </span>
                  {onRemoveEntry && (
                    <button
                      type="button"
                      onClick={() => onRemoveEntry(habit, entry)}
                      aria-label={`Remove ${habit.name} from ${selectedDay}`}
                      title="Remove this log"
                      className="mt-0.5 shrink-0 text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {onLogEntry && selectedDay && (
            <DayLogEditor
              habits={habits}
              entries={entries}
              day={selectedDay}
              today={today}
              onLog={onLogEntry}
            />
          )}
        </div>
      )}
        </>
      )}

      {collapsible && (
        <ExpandToggle
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          moreLabel="Show charts & breakdown"
          className="mt-6"
        />
      )}
    </section>
  );
}

export default InsightsPanel;
