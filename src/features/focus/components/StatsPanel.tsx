"use client";

import { useMemo } from "react";

import type { Folder } from "@/types/folder";

type Bucket = { sessions: number; focusMin: number };

type StatsPanelProps = {
  available: boolean;
  todaySessions: number;
  todayFocusMin: number;
  streak: number;
  totalSessions: number;
  totalFocusMin: number;
  last7: { label: string; sessions: number; isToday: boolean }[];
  byCollection: Record<string, Bucket>;
  folders: Folder[];
};

export function StatsPanel({
  available,
  todaySessions,
  todayFocusMin,
  streak,
  totalSessions,
  totalFocusMin,
  last7,
  byCollection,
  folders,
}: StatsPanelProps) {
  const maxSessions = Math.max(1, ...last7.map((d) => d.sessions));
  const totalHours = Math.round((totalFocusMin / 60) * 10) / 10;

  const topCollections = useMemo(() => {
    const nameById = new Map(folders.map((f) => [f.id, f.name]));
    return Object.entries(byCollection)
      .map(([id, b]) => ({ name: nameById.get(id) ?? "Removed collection", ...b }))
      .sort((a, b) => b.focusMin - a.focusMin)
      .slice(0, 3);
  }, [byCollection, folders]);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Progress
      </h3>

      {!available ? (
        <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Sign in to sync to see your streak, history, and focus by collection.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                label: "Day streak",
                value: `${streak}${streak > 0 ? " 🔥" : ""}`,
              },
              { label: "Total sessions", value: String(totalSessions) },
              { label: "Focus hours", value: String(totalHours) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-slate-950/50 px-3 py-3"
              >
                <p className="text-[11px] text-slate-500">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-slate-500">
            Last 7 days
            <span className="ml-2 normal-case text-slate-600">
              today: {todaySessions} ·{" "}
              {Math.round((todayFocusMin / 60) * 10) / 10}h
            </span>
          </p>
          <div className="flex h-24 items-end gap-2">
            {last7.map((d, i) => {
              const h = Math.round((d.sessions / maxSessions) * 100);
              return (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={`${d.sessions} session${
                        d.sessions === 1 ? "" : "s"
                      }`}
                      className={`w-full rounded ${
                        d.sessions > 0
                          ? d.isToday
                            ? "bg-blue-500"
                            : "bg-blue-500/40"
                          : "bg-slate-800"
                      }`}
                      style={{
                        height: `${Math.max(h, d.sessions > 0 ? 8 : 4)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[11px] ${
                      d.isToday
                        ? "font-medium text-slate-200"
                        : "text-slate-500"
                    }`}
                  >
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>

          {topCollections.length > 0 && (
            <>
              <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-slate-500">
                Focus by collection
              </p>
              <ul className="flex flex-col gap-1.5">
                {topCollections.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-slate-300">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {Math.round((c.focusMin / 60) * 10) / 10}h · {c.sessions}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default StatsPanel;
