"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// GitHub-style contributions heatmap. Renders ~12 months of daily activity as a
// 7-row × ~53-column grid, coloured by how many things happened that day. Each
// cell is a button so a day can be selected to reveal its detail below.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Fixed count → level thresholds (0 = empty … 4 = busiest), with their colours.
const LEVEL_CLASS = [
  "bg-slate-800/70",
  "bg-emerald-900",
  "bg-emerald-700",
  "bg-emerald-500",
  "bg-emerald-300",
];

export function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

function keyOf(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}, ${y}`;
}

type Cell = { key: string; count: number; level: number; future: boolean };
type Week = { cells: Cell[]; month: number };

type ContributionsCalendarProps = {
  counts: Map<string, number>;
  selected: string;
  onSelect: (day: string) => void;
};

export function ContributionsCalendar({
  counts,
  selected,
  onSelect,
}: ContributionsCalendarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Open showing the most recent weeks (the right edge) by default — the latest
  // activity is what you want to see first, not last September.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const { weeks, total } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = keyOf(today);

    // Start ~52 weeks back, then rewind to that week's Sunday for a clean grid.
    const start = new Date(today);
    start.setDate(today.getDate() - 364);
    start.setDate(start.getDate() - start.getDay());

    // End at the Saturday of the current week so the last column is full.
    const end = new Date(today);
    end.setDate(today.getDate() + (6 - today.getDay()));

    const out: Week[] = [];
    let sum = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const cells: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const key = keyOf(cursor);
        const future = key > todayKey;
        const count = future ? 0 : counts.get(key) ?? 0;
        sum += count;
        cells.push({ key, count, level: levelFor(count), future });
        cursor.setDate(cursor.getDate() + 1);
      }
      // Label by the month of the first in-range day of the column.
      const firstReal = cells.find((c) => !c.future) ?? cells[0];
      const [, mm] = firstReal.key.split("-").map(Number);
      out.push({ cells, month: mm - 1 });
    }
    return { weeks: out, total: sum };
  }, [counts]);

  return (
    <div>
      {/* Scrolls only when the grid can't fit (mobile); on wide screens the whole
          year shows. px keeps the first/last column's selection ring from being
          clipped at the edges. */}
      <div ref={scrollRef} className="overflow-x-auto pb-2">
        <div className="inline-flex flex-col gap-1 px-[3px]">
          {/* Month labels — each spills right over its column. */}
          <div className="flex gap-[3px]">
            {weeks.map((w, i) => {
              const prev = i > 0 ? weeks[i - 1].month : -1;
              const showLabel = w.month !== prev;
              return (
                <span
                  key={i}
                  className="relative h-3 w-3 shrink-0 text-[10px] leading-3 text-slate-400"
                >
                  {showLabel && (
                    <span className="absolute left-0 top-0 whitespace-nowrap">
                      {MONTHS[w.month]}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Week columns. */}
          <div className="flex gap-[3px]">
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {w.cells.map((c) =>
                  c.future ? (
                    <span key={c.key} className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => onSelect(c.key)}
                      title={`${c.count} ${
                        c.count === 1 ? "contribution" : "contributions"
                      } on ${prettyDate(c.key)}`}
                      aria-label={`${c.count} ${
                        c.count === 1 ? "contribution" : "contributions"
                      } on ${prettyDate(c.key)}`}
                      aria-pressed={c.key === selected}
                      className={`h-3 w-3 rounded-sm transition ${
                        LEVEL_CLASS[c.level]
                      } ${
                        c.key === selected
                          ? "ring-1 ring-slate-200 ring-offset-1 ring-offset-slate-900"
                          : "hover:ring-1 hover:ring-slate-500"
                      }`}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: help link + legend. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span>Less</span>
          {LEVEL_CLASS.map((cls, i) => (
            <span key={i} className={`h-3 w-3 rounded-sm ${cls}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {showHelp && (
        <p className="mt-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          Each square is a day. We count every focus session, task added or
          completed, mood logged, cup of water, and to-do as one contribution —
          {" "}
          <span className="text-slate-300">{total}</span> in the last year.
          Darker green means a busier day. Click any day to see what you did.
        </p>
      )}
    </div>
  );
}

export default ContributionsCalendar;
