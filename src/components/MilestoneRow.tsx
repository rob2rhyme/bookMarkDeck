"use client";

import { earnedMilestones } from "@/lib/milestones";

// A calm, points-free row of earned milestones from cumulative metrics.
// Reused across pillars; renders nothing until the first milestone is earned.
export function MilestoneRow({
  metrics,
  className = "",
  label = "Milestones earned",
}: {
  metrics: Record<string, number | undefined>;
  className?: string;
  label?: string;
}) {
  const earned = earnedMilestones(metrics);
  if (earned.length === 0) return null;

  return (
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
  );
}
