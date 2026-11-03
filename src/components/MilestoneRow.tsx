"use client";

import { earnedMilestones } from "@/lib/milestones";
import { useMilestoneCelebration } from "@/lib/useMilestoneCelebration";

// A calm, points-free row of earned milestones from cumulative metrics.
// Reused across pillars; renders nothing until the first milestone is earned.
//
// With `celebrate`, a milestone crossed since this device last looked also gets a
// quiet one-time card above the row. `account` is who it is remembered for and
// `ready` says the page's numbers have loaded — see useMilestoneCelebration.
export function MilestoneRow({
  metrics,
  className = "",
  label = "Milestones earned",
  celebrate,
}: {
  metrics: Record<string, number | undefined>;
  className?: string;
  label?: string;
  celebrate?: { account: string | null | undefined; ready: boolean };
}) {
  const earned = earnedMilestones(metrics);
  const { fresh, dismiss } = useMilestoneCelebration(
    celebrate?.account,
    metrics,
    celebrate?.ready ?? false
  );
  if (earned.length === 0 && fresh.length === 0) return null;

  return (
    <>
      {fresh.length > 0 && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 ${className}`.trim()}
        >
          <p className="min-w-0 text-sm text-slate-100">
            <span aria-hidden>{fresh[0].icon} </span>
            New milestone: {fresh.map((m) => m.label).join(" · ")}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 transition hover:border-slate-500"
          >
            Nice
          </button>
        </div>
      )}
      {earned.length > 0 && (
        <div
          className={`flex flex-wrap justify-center gap-2 ${className}`.trim()}
          aria-label={label}
        >
          {earned.map((m) => (
            <span
              key={m.id}
              title={m.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-200"
            >
              <span aria-hidden>{m.icon}</span>
              <span>{m.label}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
