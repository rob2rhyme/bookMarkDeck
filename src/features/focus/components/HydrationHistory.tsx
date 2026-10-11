"use client";

import { useMemo, useState } from "react";

import { OZ_PER_CUP } from "@/features/focus/hooks/useHydration";
import type { HydrationDay } from "@/features/focus/hooks/useHydrationHistory";
import { EMPTY_STATE_CLASS } from "@/components/ui/EmptyState";
import { dayKeyFor as dayKey } from "@/lib/dayKey";

type RangeKey = "day" | "week" | "month" | "all";

type HydrationHistoryProps = {
  available: boolean;
  history: HydrationDay[];
  todayEvents: { createdAt: string | null }[];
  goal: number;
};

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (key === dayKey(new Date())) return "Today";
  return `${MONTHS[date.getMonth()]} ${d}`;
}

function weekdayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

function timeShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

type Point = { label: string; value: number };

/** A small stock-style area chart: gradient fill, crisp line, dashed goal line. */
function AreaChart({ values, goal }: { values: number[]; goal: number }) {
  const W = 300;
  const H = 96;
  const padT = 10;
  const padB = 6;
  const n = values.length;
  if (n === 0) return null;
  const max = Math.max(1, goal, ...values);
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - padB - (v / max) * (H - padT - padB);
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const goalY = y(goal);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-28 w-full"
      role="img"
      aria-label="Hydration trend"
    >
      <defs>
        <linearGradient id="hydration-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(56 189 248)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* goal reference line */}
      {goal > 0 && (
        <line
          x1="0"
          y1={goalY}
          x2={W}
          y2={goalY}
          className="stroke-slate-600"
          strokeWidth="1"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={area} fill="url(#hydration-fill)" />
      <path
        d={line}
        fill="none"
        className="stroke-sky-400"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function HydrationHistory({
  available,
  history,
  todayEvents,
  goal,
}: HydrationHistoryProps) {
  const [range, setRange] = useState<RangeKey>("week");

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of history) m.set(r.day, r.cups);
    return m;
  }, [history]);

  const todayK = dayKey(new Date());

  const points: Point[] = useMemo(() => {
    if (range === "day") {
      // Cumulative cups through today, from the logged drink events.
      const sorted = [...todayEvents]
        .filter((e) => e.createdAt)
        .sort((a, b) => (a.createdAt! < b.createdAt! ? -1 : 1));
      if (sorted.length === 0) return [];
      const out: Point[] = [{ label: "", value: 0 }];
      sorted.forEach((e, i) =>
        out.push({ label: timeShort(e.createdAt), value: i + 1 })
      );
      return out;
    }

    const days: string[] = [];
    if (range === "all") {
      const earliest =
        history.length > 0
          ? history.map((r) => r.day).sort()[0]
          : todayK;
      const [ey, em, ed] = earliest.split("-").map(Number);
      const cur = new Date(ey, em - 1, ed);
      const end = new Date();
      while (dayKey(cur) <= todayK && days.length < 400) {
        days.push(dayKey(cur));
        cur.setDate(cur.getDate() + 1);
        if (cur > end && dayKey(cur) > todayK) break;
      }
    } else {
      const span = range === "week" ? 7 : 30;
      const now = new Date();
      for (let i = span - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        days.push(dayKey(d));
      }
    }
    return days.map((k) => ({
      label: range === "week" ? weekdayShort(k) : dayShort(k),
      value: byDay.get(k) ?? 0,
    }));
  }, [range, todayEvents, byDay, history, todayK]);

  const stats = useMemo(() => {
    if (range === "day") {
      const cups = byDay.get(todayK) ?? todayEvents.length;
      return {
        headline: cups,
        sub:
          goal > 0
            ? `of ${goal}-cup goal · ${Math.round((cups / goal) * 100)}%`
            : `${cups * OZ_PER_CUP} oz today`,
        stats: [] as { label: string; value: string }[],
      };
    }
    const vals = points.map((p) => p.value);
    const total = vals.reduce((s, v) => s + v, 0);
    const tracked = vals.filter((v) => v > 0).length;
    const avg = vals.length ? total / vals.length : 0;
    const goalMet = goal > 0 ? vals.filter((v) => v >= goal).length : 0;
    const best = Math.max(0, ...vals);
    return {
      headline: total,
      sub: `${total * OZ_PER_CUP} oz · ${Math.round(avg * 10) / 10} cups/day avg`,
      stats: [
        { label: "Days tracked", value: String(tracked) },
        { label: "Goal hit", value: `${goalMet} ${goalMet === 1 ? "day" : "days"}` },
        { label: "Best day", value: `${best} cups` },
      ],
    };
  }, [range, points, byDay, todayK, todayEvents, goal]);

  const hasData =
    range === "day"
      ? points.length > 0
      : points.some((p) => p.value > 0);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Hydration history
        </h3>
        {available && (
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
        )}
      </div>

      {!available ? (
        <p className={EMPTY_STATE_CLASS}>
          Sign in to sync to see your hydration history.
        </p>
      ) : !hasData ? (
        <p className={EMPTY_STATE_CLASS}>
          {range === "day"
            ? "No cups logged today yet."
            : "No hydration logged in this range yet."}
        </p>
      ) : (
        <>
          {/* Headline */}
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-sky-300">
              {stats.headline}
            </span>
            <span className="text-sm text-slate-400">
              {range === "day" ? "cups today" : "cups"}
            </span>
            <span className="ml-auto text-xs tabular-nums text-slate-500">
              {stats.sub}
            </span>
          </div>

          <AreaChart values={points.map((p) => p.value)} goal={goal} />

          {/* Axis endpoints */}
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{points[0]?.label || "Start"}</span>
            <span>{points[points.length - 1]?.label || "Now"}</span>
          </div>

          {/* Stats */}
          {stats.stats.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {stats.stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-slate-950/50 px-3 py-3"
                >
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-slate-50">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-500">
            <span className="mr-1 inline-block w-4 border-t border-dashed border-slate-600 align-middle" />
            Daily goal: {goal} cups
          </p>
        </>
      )}
    </section>
  );
}

export default HydrationHistory;
