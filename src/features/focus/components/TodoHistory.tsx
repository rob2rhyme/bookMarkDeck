"use client";

import { useMemo, useState } from "react";

import type { Todo } from "@/features/focus/lib/types";

type RangeKey = "week" | "month" | "all";

type TodoHistoryProps = {
  /** All to-dos (both lists). The chart buckets adds + completions by day,
   *  straight from the to-do records so it works offline and never depends on
   *  the (cloud-only) activity log. */
  todos: Todo[];
};

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "all", label: "All", days: 0 },
];

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
function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[new Date(y, m - 1, d).getMonth()]} ${d}`;
}

export function TodoHistory({ todos }: TodoHistoryProps) {
  const [range, setRange] = useState<RangeKey>("week");

  // Per-day counts of added / completed, derived from the to-dos themselves:
  // adds bucket by the creation day, completions by the day they were marked
  // done (completedAt; older done items with no stamp fall back to their day).
  const byDay = useMemo(() => {
    const map = new Map<string, { added: number; done: number }>();
    const bump = (key: string, field: "added" | "done") => {
      const cur = map.get(key) ?? { added: 0, done: 0 };
      cur[field] += 1;
      map.set(key, cur);
    };
    for (const t of todos) {
      const addedDay =
        t.day || (t.createdAt ? dayKey(new Date(t.createdAt)) : "");
      if (addedDay) bump(addedDay, "added");
      if (t.done) {
        const doneDay = t.completedAt
          ? dayKey(new Date(t.completedAt))
          : addedDay;
        if (doneDay) bump(doneDay, "done");
      }
    }
    return map;
  }, [todos]);

  const todayK = dayKey(new Date());

  const series = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const keys: string[] = [];
    if (cfg.days > 0) {
      const now = new Date();
      for (let i = cfg.days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        keys.push(dayKey(d));
      }
    } else {
      const sortedDays = [...byDay.keys()].sort();
      const earliest = sortedDays[0] ?? todayK;
      const [ey, em, ed] = earliest.split("-").map(Number);
      const cur = new Date(ey, em - 1, ed);
      while (dayKey(cur) <= todayK && keys.length < 400) {
        keys.push(dayKey(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return keys.map((k) => ({
      key: k,
      added: byDay.get(k)?.added ?? 0,
      done: byDay.get(k)?.done ?? 0,
      isToday: k === todayK,
    }));
  }, [range, byDay, todayK]);

  const totals = useMemo(() => {
    const done = series.reduce((s, d) => s + d.done, 0);
    const added = series.reduce((s, d) => s + d.added, 0);
    const best = Math.max(0, ...series.map((d) => d.done));
    return { done, added, best };
  }, [series]);

  const maxDone = Math.max(1, ...series.map((d) => d.done));
  const compact = range !== "week";
  const gap = range === "all" ? "gap-px" : range === "month" ? "gap-1" : "gap-2";
  const hasData = totals.done > 0 || totals.added > 0;

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          To-do history
        </h3>
        <div className="flex rounded-full border border-slate-800 bg-slate-950/60 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                range === r.key
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
          Complete a to-do and it’ll chart here.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
            Completed per day
          </p>
          <div className={`flex h-24 items-end ${gap}`}>
            {series.map((d) => {
              const h = Math.round((d.done / maxDone) * 100);
              return (
                <div
                  key={d.key}
                  title={`${shortDate(d.key)} · ${d.done} completed · ${d.added} added`}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t ${
                        d.done > 0
                          ? d.isToday
                            ? "bg-teal-400"
                            : "bg-teal-500/50"
                          : "bg-slate-800"
                      }`}
                      style={{ height: `${Math.max(h, d.done > 0 ? 8 : 4)}%` }}
                    />
                  </div>
                  {!compact && (
                    <span
                      className={`text-[11px] ${
                        d.isToday
                          ? "font-medium text-slate-200"
                          : "text-slate-500"
                      }`}
                    >
                      {WEEKDAYS[
                        new Date(
                          Number(d.key.slice(0, 4)),
                          Number(d.key.slice(5, 7)) - 1,
                          Number(d.key.slice(8, 10))
                        ).getDay()
                      ]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {compact && series.length > 0 && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{shortDate(series[0].key)}</span>
              <span>Today</span>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {[
              { label: "Completed", value: String(totals.done) },
              { label: "Added", value: String(totals.added) },
              { label: "Best day", value: String(totals.best) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-950/50 px-3 py-3">
                <p className="text-[11px] text-slate-500">{s.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default TodoHistory;
