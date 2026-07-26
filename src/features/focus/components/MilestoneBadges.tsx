"use client";

import { MilestoneRow } from "@/components/MilestoneRow";

// Focus milestones (streak / sessions / minutes) — a thin wrapper over the
// shared MilestoneRow so every pillar renders the same calm badge row.
export function MilestoneBadges({
  streak,
  totalSessions,
  totalFocusMin,
}: {
  streak: number;
  totalSessions: number;
  totalFocusMin: number;
}) {
  return (
    <MilestoneRow
      className="mt-3"
      metrics={{
        "focus-streak": streak,
        "focus-sessions": totalSessions,
        "focus-minutes": totalFocusMin,
      }}
    />
  );
}
