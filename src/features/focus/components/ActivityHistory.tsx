"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Trash2, X } from "@/components/icons";
import { MoodIcon } from "@/features/focus/components/MoodIcon";
import type { ActivityEvent, ActivityType } from "@/features/focus/data/focusData";
import { type MoodKey } from "@/features/focus/lib/mood";
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
const RANGES = [7, 14, 30];

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

type DayView = {
  key: string;
  label: string;
  mood?: MoodKey;
  itemCount: number;
  focusMin: number;
  items: TimelineItem[];
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

type Bar = { key: string; label: string; count: number; isToday: boolean };

/** Per-day activity bar chart. Bars are clickable to open that day below. */
function ActivityChart({
  bars,
  onSelect,
}: {
  bars: Bar[];
  onSelect: (key: string) => void;
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  const STEP = 10;
  const H = 40;
  const W = bars.length * STEP;
  const bw = STEP * 0.34; // thin bars
  const bx = (STEP - bw) / 2; // centered within each slot
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label="Activity per day"
    >
      {/* baseline */}
      <rect x={0} y={H - 0.5} width={W} height={0.5} className="fill-slate-800" />
      {bars.map((b, i) => {
        const h = b.count > 0 ? Math.max(1.5, (b.count / max) * (H - 3)) : 0;
        const x = i * STEP + bx;
        const title = `${b.label}: ${b.count} ${b.count === 1 ? "event" : "events"}`;
        return (
          <g key={b.key}>
            {h > 0 && (
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={h}
                className={b.isToday ? "fill-blue-400" : "fill-sky-500/60"}
              >
                <title>{title}</title>
              </rect>
            )}
            {b.count > 0 && (
              <rect
                x={i * STEP}
                y={0}
                width={STEP}
                height={H}
                className="cursor-pointer fill-transparent"
                onClick={() => onSelect(b.key)}
              >
                <title>{title}</title>
              </rect>
            )}
          </g>
        );
      })}
    </svg>
  );
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
  const [rangeDays, setRangeDays] = useState(7);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<TimelineItem | null>(null);
  const [pendingBulk, setPendingBulk] = useState<TimelineItem[] | null>(null);
  const [deleted, setDeleted] = useState<TimelineItem[]>([]);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const didAutoExpand = useRef(false);

  // The undo toast surfaces the most recent deletion(s), then auto-dismisses
  // (items stay in "recently deleted" until reload or restore).
  useEffect(() => {
    if (undoIds.length === 0) return;
    const t = setTimeout(() => setUndoIds([]), UNDO_MS);
    return () => clearTimeout(t);
  }, [undoIds]);

  useEffect(() => {
    if (!pendingDelete && !pendingBulk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPendingDelete(null);
        setPendingBulk(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, pendingBulk]);

  // Bucket every session + event by day (no range cap — the filter slices it).
  const buckets = useMemo(() => {
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

    return byDay;
  }, [sessions, events, taskNameById]);

  // The last `rangeDays` calendar days, oldest → newest (for the chart).
  const rangeKeys = useMemo(() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      keys.push(dayKey(d));
    }
    return keys;
  }, [rangeDays]);

  const bars: Bar[] = useMemo(() => {
    const todayK = dayKey(new Date());
    return rangeKeys.map((k) => ({
      key: k,
      label: dayLabel(k),
      count: buckets.get(k)?.length ?? 0,
      isToday: k === todayK,
    }));
  }, [rangeKeys, buckets]);

  // Days with activity inside the range, newest first (for the accordion list).
  const listDays: DayView[] = useMemo(() => {
    return [...rangeKeys]
      .reverse()
      .filter((k) => buckets.has(k))
      .map((k) => {
        const items = buckets.get(k)!;
        return {
          key: k,
          label: dayLabel(k),
          mood: moodByDay[k],
          itemCount: items.length,
          focusMin: items.reduce((sum, it) => sum + it.focusMin, 0),
          items: [...items].sort((a, b) => b.sort - a.sort),
        };
      });
  }, [rangeKeys, buckets, moodByDay]);

  // Auto-expand the most recent day with activity, once.
  useEffect(() => {
    if (!didAutoExpand.current && listDays.length) {
      didAutoExpand.current = true;
      setExpanded(new Set([listDays[0].key]));
    }
  }, [listDays]);

  const toggleDay = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openDay = (key: string) =>
    setExpanded((prev) => new Set(prev).add(key));

  const commitDelete = (items: TimelineItem[]) => {
    for (const item of items) onDelete(item.ref);
    setDeleted((prev) => [...items, ...prev]);
    setUndoIds(items.map((i) => i.id));
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    commitDelete([pendingDelete]);
    setPendingDelete(null);
  };

  const confirmBulk = () => {
    if (!pendingBulk) return;
    commitDelete(pendingBulk);
    setPendingBulk(null);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const restore = (item: TimelineItem) => {
    onRestore(item.ref);
    setDeleted((prev) => prev.filter((d) => d.id !== item.id));
    setUndoIds((cur) => cur.filter((id) => id !== item.id));
  };

  const undoItems = deleted.filter((d) => undoIds.includes(d.id));
  const undoBatch = () => {
    for (const item of undoItems) onRestore(item.ref);
    const ids = new Set(undoIds);
    setDeleted((prev) => prev.filter((d) => !ids.has(d.id)));
    setUndoIds([]);
  };

  const hasActivity = buckets.size > 0;
  const totalInRange = listDays.reduce((sum, d) => sum + d.itemCount, 0);
  const visibleIds = listDays.flatMap((d) => d.items.map((i) => i.id));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectDay = (day: DayView) => {
    const ids = day.items.map((i) => i.id);
    const allOn = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const enterSelect = () => {
    setSelectMode(true);
    setExpanded(new Set(listDays.map((d) => d.key))); // reveal items to pick
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const selectedItems = () =>
    listDays.flatMap((d) => d.items.filter((i) => selectedIds.has(i.id)));

  // One modal handles single + bulk confirmation.
  const confirmItems = pendingBulk ?? (pendingDelete ? [pendingDelete] : null);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Activity history
        </h3>
        {available && hasActivity && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-slate-800 bg-slate-950/60 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRangeDays(r)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    rangeDays === r
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r}d
                </button>
              ))}
            </div>
            {totalInRange > 0 && (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelect() : enterSelect())}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectMode
                    ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
          </div>
        )}
      </div>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Sign in to sync to see your activity timeline.
        </p>
      ) : !hasActivity ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          No activity yet. Focus, add tasks, log your mood or hydration and
          it’ll show up here.
        </p>
      ) : (
        <>
          {/* Per-day activity chart */}
          <div className="mb-5">
            <ActivityChart bars={bars} onSelect={openDay} />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{rangeKeys[0] && dayLabel(rangeKeys[0])}</span>
              <span>Today</span>
            </div>
          </div>

          {totalInRange === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
              No activity in the last {rangeDays} days. Try a wider range.
            </p>
          ) : (
            <>
              {selectMode ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="text-xs tabular-nums text-slate-400">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set(visibleIds))}
                      className="text-slate-400 transition hover:text-slate-200"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-slate-400 transition hover:text-slate-200"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => setPendingBulk(selectedItems())}
                      className="rounded-md bg-red-600/90 px-2.5 py-1 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete ({selectedIds.size})
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-3 flex items-center justify-end gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(new Set(listDays.map((d) => d.key)))
                    }
                    className="font-medium text-slate-500 transition hover:text-slate-300"
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(new Set())}
                    className="font-medium text-slate-500 transition hover:text-slate-300"
                  >
                    Collapse all
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {listDays.map((day) => {
                  const isOpen = expanded.has(day.key);
                  return (
                    <div
                      key={day.key}
                      className="rounded-xl border border-slate-800/70 bg-slate-950/30"
                    >
                      <div className="flex items-center">
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={day.items.every((i) => selectedIds.has(i.id))}
                            onChange={() => toggleSelectDay(day)}
                            aria-label={`Select all in ${day.label}`}
                            className="ml-4 h-4 w-4 shrink-0 accent-blue-500"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => toggleDay(day.key)}
                          aria-expanded={isOpen}
                          className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
                        >
                          <span className="flex items-baseline gap-2 text-sm font-medium text-slate-200">
                          <span className="text-slate-500">
                            {isOpen ? "▾" : "▸"}
                          </span>
                          {day.label}
                          {day.mood && (
                            <MoodIcon
                              mood={day.mood}
                              className="h-4 w-4"
                            />
                          )}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {day.focusMin > 0 && `${hoursLabel(day.focusMin)} focus · `}
                          {day.itemCount}{" "}
                          {day.itemCount === 1 ? "event" : "events"}
                        </span>
                        </button>
                      </div>

                      {isOpen && (
                        <ol className="relative ml-5 border-l border-slate-800 pl-5 pr-4 pb-3">
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
                                  {selectMode ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(item.id)}
                                      onChange={() => toggleSelect(item.id)}
                                      aria-label="Select activity"
                                      className="h-4 w-4 accent-blue-500"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPendingDelete(item)}
                                      aria-label="Delete activity"
                                      className="text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
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
      {undoItems.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
          <span className="min-w-0 truncate text-sm text-slate-300">
            {undoItems.length === 1
              ? `Deleted “${undoItems[0].text}”`
              : `${undoItems.length} activities deleted`}
          </span>
          <button
            type="button"
            onClick={undoBatch}
            className="shrink-0 text-sm font-medium text-blue-300 transition hover:text-blue-200"
          >
            Undo
          </button>
        </div>
      )}

      {/* Confirm-delete modal (single + bulk) */}
      {confirmItems && (
        <div
          onClick={() => {
            setPendingDelete(null);
            setPendingBulk(null);
          }}
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
                {confirmItems.length === 1
                  ? "Delete this activity?"
                  : `Delete ${confirmItems.length} activities?`}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null);
                  setPendingBulk(null);
                }}
                aria-label="Cancel"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {confirmItems.length === 1 ? (
              <p className="mt-3 truncate text-sm text-slate-300">
                {TYPE_META[confirmItems[0].type].glyph} {confirmItems[0].text}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-300">
                {confirmItems.length} selected items will be removed.
              </p>
            )}
            {confirmItems.some((i) => i.ref.source === "session") && (
              <p className="mt-2 text-xs text-amber-300/90">
                Some of these are focus blocks — deleting them also removes them
                from your stats and streak.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              You can undo right after, or restore from “Recently deleted”.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null);
                  setPendingBulk(null);
                }}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={pendingBulk ? confirmBulk : confirmDelete}
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
