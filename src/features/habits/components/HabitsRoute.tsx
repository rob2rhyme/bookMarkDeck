"use client";

// Thin client switch for /habits: renders the beginner-first SimpleHabitsDashboard
// or the Classic HabitsDashboard based on the persisted view setting. Both share
// the same useHabits data, so flipping between them is lossless. The Classic
// dashboard is not modified by this redesign; Classic gets its "switch to Simple"
// affordance here rather than inside HabitsDashboard.
//
// We gate on `hydrated` so the persisted choice is known before committing to a
// layout — otherwise a Classic user would briefly see Simple (the default) on
// first paint, then a jarring swap.

import { useHabitsView } from "@/lib/habitsViewSettings";
import { HabitsDashboard } from "@/features/habits/components/HabitsDashboard";
import { HabitsViewToggle } from "@/features/habits/components/HabitsViewToggle";
import { SimpleHabitsDashboard } from "@/features/habits/components/SimpleHabitsDashboard";

export function HabitsRoute() {
  const { view, hydrated } = useHabitsView();

  if (!hydrated) {
    // One-frame placeholder until the persisted view loads (avoids a flash).
    return (
      <div
        className="h-64 animate-pulse rounded-2xl border border-slate-800/70 bg-slate-900/50"
        aria-hidden="true"
      />
    );
  }

  if (view === "classic") {
    // Classic's own header has no toggle (HabitsDashboard is unmodified), so the
    // same segmented toggle lives here, above it.
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <HabitsViewToggle />
        </div>
        <HabitsDashboard />
      </div>
    );
  }

  return <SimpleHabitsDashboard />;
}

export default HabitsRoute;
