"use client";

// Thin client switch for /habits: renders the beginner-first SimpleHabitsDashboard
// or the Classic HabitsDashboard based on the persisted view setting. Both share
// the same useHabits data, so flipping between them is lossless. Each dashboard
// renders the Simple/Classic toggle inline in its own header, so the switch sits
// in the same spot in either view.
//
// We gate on `hydrated` so the persisted choice is known before committing to a
// layout — otherwise a Classic user would briefly see Simple (the default) on
// first paint, then a jarring swap.

import { useHabitsView } from "@/lib/habitsViewSettings";
import { HabitsDashboard } from "@/features/habits/components/HabitsDashboard";
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

  // Both dashboards render the Simple/Classic toggle inline in their own header,
  // so the switch sits in the same place in either view.
  if (view === "classic") return <HabitsDashboard />;

  return <SimpleHabitsDashboard />;
}

export default HabitsRoute;
