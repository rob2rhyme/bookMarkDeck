"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { hueColor } from "@/features/habits/lib/format";
import {
  HABIT_TEMPLATES,
  type HabitTemplate,
  habitFromTemplate,
} from "@/features/habits/lib/templates";
import type { Habit } from "@/features/habits/lib/types";

type HabitOnboardingProps = {
  open: boolean;
  onClose: () => void;
  onAddMany: (habits: Habit[]) => void;
  nextSortOrder: number;
};

const GROUPS = ["Health", "Focus", "Mind", "Home"] as const;

export function HabitOnboarding({
  open,
  onClose,
  onAddMany,
  nextSortOrder,
}: HabitOnboardingProps) {
  const [picked, setPicked] = useState<HabitTemplate[]>([]);

  const toggle = (t: HabitTemplate) =>
    setPicked((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );

  const finish = () => {
    const now = new Date().toISOString();
    const habits = picked.map((t, i) =>
      habitFromTemplate(t, crypto.randomUUID(), nextSortOrder + i, now)
    );
    if (habits.length) onAddMany(habits);
    setPicked([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="habit-onboard-title"
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="habit-onboard-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Start with a few habits
      </h2>
      <p className="mt-1 text-[13px] text-slate-400">
        Pick a couple to begin — small and doable. You can tweak or add your own
        anytime.
      </p>

      {GROUPS.map((group) => (
        <div key={group} className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            {group}
          </p>
          <div className="flex flex-wrap gap-2">
            {HABIT_TEMPLATES.filter((t) => t.group === group).map((t) => {
              const on = picked.includes(t);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => toggle(t)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                    on
                      ? "border-blue-400/70 bg-blue-500/10 text-blue-100"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                  style={on ? { boxShadow: `inset 0 0 0 9999px ${hueColor(t.hue, "soft")}33` } : undefined}
                >
                  <span aria-hidden="true">{t.emoji}</span>
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          I&apos;ll add my own
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={picked.length === 0}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {picked.length ? `Add ${picked.length} habit${picked.length > 1 ? "s" : ""}` : "Add habits"}
        </button>
      </div>
    </Modal>
  );
}

export default HabitOnboarding;
