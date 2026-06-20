"use client";

import { useEffect, useMemo, useState } from "react";

import { Trash2, X } from "@/components/icons";
import type { ActivityEvent, ActivityType } from "@/features/focus/data/focusData";
import { MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

// A handle to the underlying record so a deleted item can be removed/restored.
export type ActivityRef =
  | { source: "session"; record: FocusSessionRecord }
  | { source: "event"; record: ActivityEvent };

type ActivityHistoryProps = {
  available: boolean;
  sessions: FocusSessionRecord[];
  events: ActivityEvent[];
  taskNameById: Record<string, string>;
  moodByDay: Record<string, MoodKey>;
  onDelete: (ref: ActivityRef) => void;
  onRestore: (ref: ActivityRef) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const UNDO_MS = 6000;

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
  ref: ActivityRef;
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
  onDelete,
  onRestore,
}: ActivityHistoryProps) {
  const [pendingDelete, setPendingDelete] = useState<TimelineItem | null>(null);
  const [deleted, setDeleted] = useState<TimelineItem[]>([]);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  // The undo toast surfaces the most recent deletion, then auto-dismisses
  // (the item stays in "recently deleted" until reload or restore).
  useEffect(() => {
    if (!undoId) return;
    const t = setTimeout(() => setUndoId(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undoId]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  // Merge focus sessions + logged events into one timeline, grouped by day
  // (newest first), items within a day newest first.
  const days = useMemo(() => {
    const byDay = new Map<string, TimelineItem[]>();
    const push = (day: string, item: TimelineItem) => {
      const bucket = byDay.get(day);
      if (bucket) bucket.push(item);
      else byDay.set(day, [item]);
    };

    for (const s of sessions) {
      if (!s.day) continue;
      const taskName = s.taskId ? taskNameById[s.taskId] : null;
      push(s.day, {
        id: `session-${s.id}`,
        type: "focus",
        text: `Focused ${hoursLabel(s.focusMin)}${taskName ? ` on ${taskName}` : ""}`,
        createdAt: s.createdAt,
        sort: s.createdAt ? new Date(s.createdAt).getTime() : 0,
        focusMin: s.focusMin,
        ref: { source: "session", record: s },
      });
    }

    for (const e of events) {
      if (!e.day) continue;
      push(e.day, {
        id: e.id,
        type: e.type,
        text: e.summary,
        createdAt: e.createdAt,
        sort: e.createdAt ? new Date(e.createdAt).getTime() : 0,
        focusMin: 0,
        ref: { source: "event", record: e },
      });
    }

    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14) // most recent two weeks of activity
      .map(([key, list]) => ({
        key,
        label: dayLabel(key),
        mood: moodByDay[key],
        itemCount: list.length,
        focusMin: list.reduce((sum, it) => sum + it.focusMin, 0),
        items: [...list].sort((a, b) => b.sort - a.sort),
      }));
  }, [sessions, events, taskNameById, moodByDay]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.ref);
    setDeleted((prev) => [pendingDelete, ...prev]);
    setUndoId(pendingDelete.id);
    setPendingDelete(null);
  };

  const restore = (item: TimelineItem) => {
    onRestore(item.ref);
    setDeleted((prev) => prev.filter((d) => d.id !== item.id));
    setUndoId((cur) => (cur === item.id ? null : cur));
  };

  const undoItem = undoId
    ? deleted.find((d) => d.id === undoId) ?? null
    : null;

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
                  <li
                    key={item.id}
                    className="group relative pb-4 last:pb-0"
                  >
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
                      <span className="flex shrink-0 items-center gap-2">
                        {item.createdAt && (
                          <span className="text-xs tabular-nums text-slate-500">
                            {timeOf(item.createdAt)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          aria-label="Delete activity"
                          className="text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {/* Recently deleted */}
      {deleted.length > 0 && (
        <div className="mt-6 border-t border-slate-800/60 pt-4">
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-300"
          >
            {showDeleted ? "▾" : "▸"} Recently deleted ({deleted.length})
          </button>
          {showDeleted && (
            <ul className="mt-3 flex flex-col gap-2">
              {deleted.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-slate-400">
                    <span className="mr-1.5" aria-hidden="true">
                      {TYPE_META[item.type].glyph}
                    </span>
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => restore(item)}
                    className="shrink-0 text-xs font-medium text-blue-300 transition hover:text-blue-200"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Undo toast */}
      {undoItem && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
          <span className="min-w-0 truncate text-sm text-slate-300">
            Deleted “{undoItem.text}”
          </span>
          <button
            type="button"
            onClick={() => restore(undoItem)}
            className="shrink-0 text-sm font-medium text-blue-300 transition hover:text-blue-200"
          >
            Undo
          </button>
        </div>
      )}

      {/* Confirm-delete modal */}
      {pendingDelete && (
        <div
          onClick={() => setPendingDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Confirm delete"
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-base font-semibold text-slate-50">
                Delete this activity?
              </h2>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                aria-label="Cancel"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 truncate text-sm text-slate-300">
              {TYPE_META[pendingDelete.type].glyph} {pendingDelete.text}
            </p>
            {pendingDelete.ref.source === "session" && (
              <p className="mt-2 text-xs text-amber-300/90">
                This focus block also counts toward your stats and streak —
                deleting it removes it from those too.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              You can undo this right after, or restore it from “Recently
              deleted”.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ActivityHistory;
