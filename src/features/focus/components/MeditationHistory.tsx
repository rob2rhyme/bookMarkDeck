"use client";

import { useMemo, useState } from "react";

import type { MeditationSessionRecord } from "@/features/focus/data/focusData";
import { EMPTY_STATE_CLASS } from "@/components/ui/EmptyState";

type RangeKey = "day" | "week" | "month" | "all";

type MeditationHistoryProps = {
  available: boolean;
  sessions: MeditationSessionRecord[];
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

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

/** A small stock-style area chart: gradient fill, crisp line. */
function AreaChart({ values }: { values: number[] }) {
  const W = 300;
  const H = 96;
  const padT = 10;
  const padB = 6;
  const n = values.length;
  if (n === 0) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - padB - (v / max) * (H - padT - padB);
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-28 w-full"
      role="img"
      aria-label="Meditation trend"
    >
      <defs>
        <linearGradient id="meditation-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(129 140 248)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(129 140 248)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#meditation-fill)" />
      <path
        d={line}
        fill="none"
        className="stroke-indigo-400"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MeditationHistory({
  available,
  sessions,
}: MeditationHistoryProps) {
  const [range, setRange] = useState<RangeKey>("week");

  // Minutes summed per day, and the session count per day.
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) {
      if (!s.day) continue;
      m.set(s.day, (m.get(s.day) ?? 0) + s.minutes);
    }
    return m;
  }, [sessions]);

  const todayK = dayKey(new Date());

  const todaySessions = useMemo(
    () =>
      sessions
        .filter((s) => s.day === todayK)
        .sort((a, b) =>
          (a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1
        ),
    [sessions, todayK]
  );

  const points: Point[] = useMemo(() => {
    if (range === "day") {
      // Cumulative minutes through today, in the order sessions were logged.
      if (todaySessions.length === 0) return [];
      const out: Point[] = [{ label: "", value: 0 }];
      let sum = 0;
      todaySessions.forEach((s) => {
        sum += s.minutes;
        out.push({ label: timeShort(s.createdAt), value: sum });
      });
      return out;
    }

    const days: string[] = [];
    if (range === "all") {
      const earliest =
        sessions.length > 0
          ? sessions.map((s) => s.day).filter(Boolean).sort()[0] ?? todayK
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
  }, [range, todaySessions, byDay, sessions, todayK]);

  const stats = useMemo(() => {
    if (range === "day") {
      const mins = byDay.get(todayK) ?? 0;
      return {
        headline: mins,
        sub: `${todaySessions.length} ${
          todaySessions.length === 1 ? "session" : "sessions"
        } today`,
        stats: [] as { label: string; value: string }[],
      };
    }
    const vals = points.map((p) => p.value);
    const total = vals.reduce((s, v) => s + v, 0);
    const tracked = vals.filter((v) => v > 0).length;
    const avg = tracked ? total / tracked : 0;
    const best = Math.max(0, ...vals);
    return {
      headline: total,
      sub: `${Math.round(avg)} min/day avg on active days`,
      stats: [
        { label: "Days practised", value: String(tracked) },
        {
          label: "Sessions",
          value: String(
            sessions.filter((s) => {
              if (range === "all") return true;
              const span = range === "week" ? 7 : 30;
              const cutoff = new Date();
              cutoff.setDate(cutoff.getDate() - (span - 1));
              return s.day >= dayKey(cutoff);
            }).length
          ),
        },
        { label: "Best day", value: `${best} min` },
      ],
    };
  }, [range, points, byDay, todayK, todaySessions, sessions]);

  const hasData =
    range === "day" ? points.length > 0 : points.some((p) => p.value > 0);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Meditation history
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
          Sign in to sync to see your meditation history.
        </p>
      ) : !hasData ? (
        <p className={EMPTY_STATE_CLASS}>
          {range === "day"
            ? "No meditation logged today yet."
            : "No meditation logged in this range yet."}
        </p>
      ) : (
        <>
          {/* Headline */}
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-indigo-300">
              {stats.headline}
            </span>
            <span className="text-sm text-slate-400">
              {range === "day" ? "min today" : "min"}
            </span>
            <span className="ml-auto text-xs tabular-nums text-slate-500">
              {stats.sub}
            </span>
          </div>

          <AreaChart values={points.map((p) => p.value)} />

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
        </>
      )}
    </section>
  );
}

export default MeditationHistory;
