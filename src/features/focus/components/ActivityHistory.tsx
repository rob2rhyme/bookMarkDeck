"use client";

import { useMemo } from "react";

import type { ActivityEvent, ActivityType } from "@/features/focus/data/focusData";
import { MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

type ActivityHistoryProps = {
  available: boolean;
  sessions: FocusSessionRecord[];
  events: ActivityEvent[];
  taskNameById: Record<string, string>;
  moodByDay: Record<string, MoodKey>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Per-type timeline dot color + leading glyph.
const TYPE_META: Record<ActivityType, { dot: string; glyph: string }> = {
  focus: { dot: "border-blue-500", glyph: "🎯" },
  task_added: { dot: "border-violet-500", glyph: "➕" },
  task_done: { dot: "border-emerald-500", glyph: "✓" },
  mood: { dot: "border-amber-500", glyph: "🙂" },
  journal: { dot: "border-slate-400", glyph: "📝" },
  hydration: { dot: "border-sky-500", glyph: "💧" },
};

type TimelineItem = {
  id: string;
  type: ActivityType;
  text: string;
  createdAt: string | null;
  sort: number;
  focusMin: number;
};

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(key: string): string {
  const today = new Date();
  if (key === dayKey(today)) return "Today";
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (key === dayKey(yest)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}`;
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function hoursLabel(min: number) {
  if (min < 60) return `${min}m`;
  return `${Math.round((min / 60) * 10) / 10}h`;
}

export function ActivityHistory({
  available,
  sessions,
  events,
  taskNameById,
  moodByDay,
}: ActivityHistoryProps) {
  // Merge focus sessions + logged events into one timeline, grouped by day
  // (newest first), items within a day newest first.
  const days = useMemo(() => {
    const byDay = new Map<string, TimelineItem[]>();
    const push = (day: string, item: TimelineItem) => {
      const bucket = byDay.get(day);
      if (bucket) bucket.push(item);
      else byDay.set(day, [item]);
    };

    sessions.forEach((s, i) => {
      if (!s.day) return;
      const taskName = s.taskId ? taskNameById[s.taskId] : null;
      push(s.day, {
        id: `focus-${i}-${s.createdAt ?? ""}`,
        type: "focus",
        text: `Focused ${hoursLabel(s.focusMin)}${taskName ? ` on ${taskName}` : ""}`,
        createdAt: s.createdAt,
        sort: s.createdAt ? new Date(s.createdAt).getTime() : 0,
        focusMin: s.focusMin,
      });
    });

    for (const e of events) {
      if (!e.day) continue;
      push(e.day, {
        id: e.id,
        type: e.type,
        text: e.summary,
        createdAt: e.createdAt,
        sort: e.createdAt ? new Date(e.createdAt).getTime() : 0,
        focusMin: 0,
      });
    }

    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14) // most recent two weeks of activity
      .map(([key, list]) => {
        const focusMin = list.reduce((sum, it) => sum + it.focusMin, 0);
        return {
          key,
          label: dayLabel(key),
          mood: moodByDay[key],
          itemCount: list.length,
          focusMin,
          items: [...list].sort((a, b) => b.sort - a.sort),
        };
      });
  }, [sessions, events, taskNameById, moodByDay]);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Activity history
      </h3>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Sign in to sync to see your activity timeline.
        </p>
      ) : days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          No activity yet. Focus, add tasks, log your mood or hydration and
          it’ll show up here.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <div key={day.key}>
              <div className="mb-3 flex items-baseline justify-between">
                <h4 className="text-sm font-medium text-slate-200">
                  {day.label}
                  {day.mood && (
                    <span className="ml-2" title={MOOD_BY_KEY[day.mood].label}>
                      {MOOD_BY_KEY[day.mood].emoji}
                    </span>
                  )}
                </h4>
                <span className="text-xs tabular-nums text-slate-500">
                  {day.focusMin > 0 && `${hoursLabel(day.focusMin)} focus · `}
                  {day.itemCount} {day.itemCount === 1 ? "event" : "events"}
                </span>
              </div>

              {/* Timeline */}
              <ol className="relative ml-1 border-l border-slate-800 pl-5">
                {day.items.map((item) => (
                  <li key={item.id} className="relative pb-4 last:pb-0">
                    <span
                      className={`absolute -left-[23px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 bg-slate-950 ${TYPE_META[item.type].dot}`}
                    />
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-slate-200">
                        <span className="mr-1.5" aria-hidden="true">
                          {TYPE_META[item.type].glyph}
                        </span>
                        {item.text}
                      </span>
                      {item.createdAt && (
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {timeOf(item.createdAt)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default ActivityHistory;
