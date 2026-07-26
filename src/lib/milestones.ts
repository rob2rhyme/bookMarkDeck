// Calm, points-free milestones. Given cumulative metrics, return the single
// milestone each metric has most recently crossed (not a running tally), so the
// UI can show a small row of earned badges and celebrate a freshly-crossed one.
// Pure — see milestones.test.ts.

export type Milestone = {
  id: string; // stable, e.g. "focus-streak-7"
  metric: string; // "focus-streak" | "focus-sessions" | ...
  value: number; // the threshold crossed
  label: string;
  icon: string;
};

type Ladder = {
  metric: string;
  icon: string;
  thresholds: number[];
  label: (n: number) => string;
};

const LADDERS: Ladder[] = [
  { metric: "focus-streak", icon: "🔥", thresholds: [3, 7, 14, 30, 60, 100], label: (n) => `${n}-day focus streak` },
  { metric: "focus-sessions", icon: "🎯", thresholds: [10, 25, 50, 100, 250, 500], label: (n) => `${n} focus sessions` },
  { metric: "focus-minutes", icon: "⏳", thresholds: [100, 500, 1000, 5000, 10000], label: (n) => `${n} focus minutes` },
  { metric: "habit-streak", icon: "🌱", thresholds: [7, 14, 30, 60, 100], label: (n) => `${n}-day habit streak` },
  { metric: "items", icon: "📦", thresholds: [10, 25, 50, 100, 250], label: (n) => `${n} items catalogued` },
  { metric: "bookmarks", icon: "🔖", thresholds: [25, 50, 100, 250, 500], label: (n) => `${n} bookmarks saved` },
];

/** Highest threshold crossed for a metric, or 0 if below the first. */
function crossedThreshold(value: number, thresholds: number[]): number {
  let crossed = 0;
  for (const t of thresholds) if (value >= t) crossed = t;
  return crossed;
}

/**
 * The current milestone for each provided metric (the highest threshold reached).
 * Metrics that are missing, ≤0, or below their first threshold are skipped.
 */
export function earnedMilestones(
  metrics: Record<string, number | undefined>
): Milestone[] {
  const out: Milestone[] = [];
  for (const ladder of LADDERS) {
    const v = metrics[ladder.metric];
    if (typeof v !== "number" || v <= 0) continue;
    const crossed = crossedThreshold(v, ladder.thresholds);
    if (crossed > 0) {
      out.push({
        id: `${ladder.metric}-${crossed}`,
        metric: ladder.metric,
        value: crossed,
        label: ladder.label(crossed),
        icon: ladder.icon,
      });
    }
  }
  return out;
}
