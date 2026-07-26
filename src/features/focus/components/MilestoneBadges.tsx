"use client";

import { earnedMilestones } from "@/lib/milestones";

// A calm, points-free row of earned focus milestones (streak / sessions /
// minutes). No economy, no badges to chase — just quiet acknowledgement of
// progress the stats already track.
export function MilestoneBadges({
  streak,
  totalSessions,
  totalFocusMin,
}: {
  streak: number;
  totalSessions: number;
  totalFocusMin: number;
}) {
  const earned = earnedMilestones({
    "focus-streak": streak,
    "focus-sessions": totalSessions,
    "focus-minutes": totalFocusMin,
  });
  if (earned.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Milestones earned">
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
