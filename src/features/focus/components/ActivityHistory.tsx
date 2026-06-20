"use client";

import { useMemo } from "react";

import { MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

type ActivityHistoryProps = {
  available: boolean;
  sessions: FocusSessionRecord[];
  taskNameById: Record<string, string>;
  moodByDay: Record<string, MoodKey>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
  taskNameById,
  moodByDay,
}: ActivityHistoryProps) {
  // Group sessions by day, newest first; sessions within a day newest first.
  const days = useMemo(() => {
    const byDay = new Map<string, FocusSessionRecord[]>();
    for (const s of sessions) {
      if (!s.day) continue;
      const bucket = byDay.get(s.day);
      if (bucket) bucket.push(s);
      else byDay.set(s.day, [s]);
    }
    const sortTime = (r: FocusSessionRecord) =>
      r.createdAt ? new Date(r.createdAt).getTime() : 0;
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14) // most recent two weeks of activity
      .map(([key, list]) => ({
        key,
        label: dayLabel(key),
        mood: moodByDay[key],
        totalMin: list.reduce((sum, s) => sum + s.focusMin, 0),
        sessions: [...list].sort((a, b) => sortTime(b) - sortTime(a)),
      }));
  }, [sessions, moodByDay]);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Activity history
      </h3>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Sign in to sync to see your focus timeline.
        </p>
      ) : days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          No focus blocks logged yet. Finish a session and it’ll show up here.
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
                  {hoursLabel(day.totalMin)} · {day.sessions.length}{" "}
                  {day.sessions.length === 1 ? "session" : "sessions"}
                </span>
              </div>

              {/* Timeline */}
              <ol className="relative ml-1 border-l border-slate-800 pl-5">
                {day.sessions.map((s, i) => (
                  <li key={i} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-[23px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-blue-500 bg-slate-950" />
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-slate-200">
                        Focused{" "}
                        <span className="font-medium">
                          {hoursLabel(s.focusMin)}
                        </span>
                        {s.taskId && taskNameById[s.taskId] && (
                          <>
                            {" on "}
                            <span className="text-slate-300">
                              {taskNameById[s.taskId]}
                            </span>
                          </>
                        )}
                      </span>
                      {s.createdAt && (
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {timeOf(s.createdAt)}
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
