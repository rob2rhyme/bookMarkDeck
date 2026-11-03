"use client";

import { MilestoneRow } from "@/components/MilestoneRow";

// Focus milestones (streak / sessions / minutes) — a thin wrapper over the
// shared MilestoneRow so every pillar renders the same calm badge row.
export function MilestoneBadges({
  streak,
  totalSessions,
  totalFocusMin,
  account,
  ready,
}: {
  streak: number;
  totalSessions: number;
  totalFocusMin: number;
  account?: string | null;
  /** The session list has loaded, so the totals are real. */
  ready: boolean;
}) {
  return (
    <MilestoneRow
      className="mt-3"
      celebrate={{ account, ready }}
      metrics={{
        "focus-streak": streak,
        "focus-sessions": totalSessions,
        "focus-minutes": totalFocusMin,
      }}
    />
  );
}
