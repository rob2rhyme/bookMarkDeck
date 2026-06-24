"use client";

// Shared Simple/Classic segmented toggle, used by both dashboards so the switch
// looks and behaves identically in either view (no standalone one-off button).

import { type HabitsView, useHabitsView } from "@/lib/habitsViewSettings";

export function HabitsViewToggle() {
  const { view, setView } = useHabitsView();

  const pill = (target: HabitsView) =>
    `rounded-full px-3 py-1 transition ${
      view === target
        ? "bg-blue-600 text-white"
        : "text-slate-300 hover:text-slate-100"
    }`;

  return (
    <div className="inline-flex rounded-full border border-slate-800 bg-slate-900 p-0.5 text-xs font-medium">
      <button
        type="button"
        aria-pressed={view === "simple"}
        onClick={() => setView("simple")}
        className={pill("simple")}
      >
        ✨ Simple
      </button>
      <button
        type="button"
        aria-pressed={view === "classic"}
        onClick={() => setView("classic")}
        className={pill("classic")}
      >
        Classic
      </button>
    </div>
  );
}

export default HabitsViewToggle;
