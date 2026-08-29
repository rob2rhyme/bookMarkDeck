"use client";

// What the filing log says about itself.
//
// Every chart here answers a MAGNITUDE question about a single series, so each
// uses one hue and carries its own direct labels — identity comes from the row
// label, never from colour alone. No legend, because no chart has a second
// series to distinguish.
//
// Bars are CSS heights rather than SVG, matching the focus 7-day chart, and each
// one is a button with a readout below: hover tooltips don't exist on touch, and
// this pillar is used standing at a filing cabinet with a phone.

import { useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import {
  ACTIVITY_LABELS,
  activityByMonth,
  allActivity,
  papersByFolder,
  summarize,
  totalsByType,
} from "@/features/filing/lib/stats";
import type { FilingDocument, FilingFolder } from "@/features/filing/lib/types";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-3">
      <p className="text-lg font-semibold tabular-nums text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

/** A labelled horizontal bar. Magnitude is the job, so the label carries identity. */
function Row({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-[12px] text-slate-300" title={label}>
        {label}
      </span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span
          className="block h-full rounded-full bg-blue-500"
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-slate-400">
        {count}
      </span>
    </li>
  );
}

export function FilingInsights({
  documents,
  folders,
  placeCount,
  today,
}: {
  documents: FilingDocument[];
  folders: FilingFolder[];
  placeCount: number;
  today: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (!today) return null;

  const activity = allActivity(documents, folders);
  const months = activityByMonth(activity, today, 12);
  const byType = totalsByType(activity);
  const byFolder = papersByFolder(documents, folders);
  const s = summarize(documents, folders, placeCount, today);

  const maxMonth = Math.max(1, ...months.map((m) => m.total));
  const chosen = months.find((m) => m.month === selected) ?? null;
  const busiest = months.reduce((a, b) => (b.total > a.total ? b : a), months[0]);

  return (
    <section className="px-3 sm:px-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Filing history
        </h3>
        {activity.length > 0 && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {activity.length} events
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Papers filed" value={s.papers} />
          <Stat label="Folders" value={s.folders} />
          <Stat label="Added this month" value={s.filedThisMonth} />
          <Stat label="With a reminder" value={s.withReminders} />
          <Stat label="Renewed or paid" value={s.handledThisYear} hint="last 12 months" />
          <Stat label="Cleared out" value={s.cleared} />
          <Stat label="Ready to clear" value={s.readyToClear} />
          <Stat label="Linked to an account" value={s.linked} />
        </div>

        {activity.length === 0 ? (
          <EmptyState className="mt-4">
            Nothing recorded yet. Filing a paper, paying a reminder or clearing
            something out all show up here.
          </EmptyState>
        ) : (
          <>
            <p className="mb-2 mt-5 text-[11px] uppercase tracking-wide text-slate-500">
              Activity by month
            </p>
            <div className="flex h-28 items-stretch gap-1">
              {months.map((m) => {
                const pct = (m.total / maxMonth) * 100;
                const isSel = selected === m.month;
                const isNow = m.month === today.slice(0, 7);
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => setSelected(isSel ? null : m.month)}
                    aria-label={`${m.label}: ${m.total} event${m.total === 1 ? "" : "s"}`}
                    aria-pressed={isSel}
                    className="flex h-full flex-1 cursor-pointer flex-col items-center gap-1.5 outline-none"
                  >
                    <span className="flex w-full flex-1 items-end">
                      <span
                        className={`w-full rounded transition ${
                          m.total > 0
                            ? isNow
                              ? "bg-blue-500"
                              : "bg-blue-500/40"
                            : "bg-slate-800"
                        } ${
                          isSel
                            ? "ring-2 ring-blue-200 ring-offset-1 ring-offset-slate-900"
                            : "hover:brightness-125"
                        }`}
                        style={{ height: `${Math.max(pct, m.total > 0 ? 8 : 4)}%` }}
                      />
                    </span>
                    <span
                      className={`text-[10px] ${
                        isSel || isNow ? "font-medium text-slate-200" : "text-slate-500"
                      }`}
                    >
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Readout rather than a hover tooltip — this is used on a phone. */}
            <div className="mt-2 min-h-[1.25rem] text-[11px] text-slate-400">
              {chosen ? (
                chosen.total === 0 ? (
                  <span>Nothing filed in {chosen.label}.</span>
                ) : (
                  <span>
                    {chosen.label}:{" "}
                    {Object.entries(chosen.byType)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, n]) => `${n} ${ACTIVITY_LABELS[type as never] ?? type}`)
                      .join(" · ")}
                  </span>
                )
              ) : (
                <span className="text-slate-500">
                  {busiest && busiest.total > 0
                    ? `Busiest month: ${busiest.label} (${busiest.total}). Tap a bar for its breakdown.`
                    : "Tap a bar to see that month."}
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
                  What you did
                </p>
                <ul className="flex flex-col gap-2">
                  {byType.slice(0, 6).map((t) => (
                    <Row
                      key={t.type}
                      label={ACTIVITY_LABELS[t.type] ?? t.type}
                      count={t.count}
                      max={byType[0]?.count ?? 1}
                    />
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
                  Where the paper is
                </p>
                {byFolder.length === 0 ? (
                  <EmptyState>Nothing filed yet.</EmptyState>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {byFolder.map((f) => (
                      <Row
                        key={f.key}
                        label={f.label}
                        count={f.count}
                        max={byFolder[0]?.count ?? 1}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <p className="mt-4 text-[10px] text-slate-500">
              Counted from each record&rsquo;s own history, which keeps its last 300
              events — so a long-lived paper&rsquo;s earliest entries age out.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
