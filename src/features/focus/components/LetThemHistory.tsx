"use client";

import { useMemo, useState } from "react";

import type { ResetRecord } from "@/features/focus/data/focusData";
import { resetStreak } from "@/features/focus/lib/letThem";
import { EMPTY_STATE_CLASS } from "@/components/ui/EmptyState";
import { dayKeyFor as dayKey } from "@/lib/dayKey";

type RangeKey = "week" | "month" | "all";

type LetThemHistoryProps = {
  available: boolean;
  resets: ResetRecord[];
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

function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[new Date(y, m - 1, d).getMonth()]} ${d}`;
}

export function LetThemHistory({ available, resets }: LetThemHistoryProps) {
  const [range, setRange] = useState<RangeKey>("week");

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resets) {
      if (!r.day) continue;
      m.set(r.day, (m.get(r.day) ?? 0) + 1);
    }
    return m;
  }, [resets]);

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
      const sorted = [...byDay.keys()].sort();
      const earliest = sorted[0] ?? todayK;
      const [ey, em, ed] = earliest.split("-").map(Number);
      const cur = new Date(ey, em - 1, ed);
      while (dayKey(cur) <= todayK && keys.length < 400) {
        keys.push(dayKey(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return keys.map((k) => ({ key: k, count: byDay.get(k) ?? 0, isToday: k === todayK }));
  }, [range, byDay, todayK]);

  const total = resets.length;
  const streak = resetStreak(resets, todayK);
  const inRange = series.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(1, ...series.map((d) => d.count));
  const compact = range !== "week";
  const gap = range === "all" ? "gap-px" : range === "month" ? "gap-1" : "gap-2";

  const recent = useMemo(
    () =>
      [...resets]
        .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))
        .slice(0, 4),
    [resets]
  );

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Reset history
        </h3>
        {available && total > 0 && (
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
          Sign in to sync to see your reset history.
        </p>
      ) : total === 0 ? (
        <p className={EMPTY_STATE_CLASS}>
          Log a reset and it&apos;ll chart here.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
            Resets per day
          </p>
          <div className={`flex h-24 items-end ${gap}`}>
            {series.map((d) => {
              const h = Math.round((d.count / maxCount) * 100);
              return (
                <div
                  key={d.key}
                  title={`${shortDate(d.key)} · ${d.count} reset${d.count === 1 ? "" : "s"}`}
                  className="flex h-full flex-1 flex-col items-center gap-1"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t ${
                        d.count > 0
                          ? d.isToday
                            ? "bg-teal-400"
                            : "bg-teal-500/50"
                          : "bg-slate-800"
                      }`}
                      style={{ height: `${Math.max(h, d.count > 0 ? 8 : 4)}%` }}
                    />
                  </div>
                  {!compact && (
                    <span
                      className={`text-[11px] ${
                        d.isToday ? "font-medium text-slate-200" : "text-slate-500"
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
              { label: range === "week" ? "This week" : range === "month" ? "This month" : "In range", value: String(inRange) },
              { label: "Streak", value: `${streak}d` },
              { label: "Total", value: String(total) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-950/50 px-3 py-3">
                <p className="text-[11px] text-slate-500">{s.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {recent.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline gap-2 rounded-lg bg-slate-950/30 px-3 py-2 text-[13px]"
                >
                  <span className="shrink-0 text-teal-300/80">✋</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">
                    {r.trigger || "Let it go"}
                    {r.action ? (
                      <span className="text-slate-500"> → {r.action}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {r.day === todayK ? "Today" : shortDate(r.day)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default LetThemHistory;
