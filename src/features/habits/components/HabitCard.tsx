"use client";

import { Check, Note } from "@/components/icons";
import { HabitRing } from "@/features/habits/components/HabitRing";
import { hueColor, scheduleLabel } from "@/features/habits/lib/format";
import {
  type Habit,
  type HabitEntry,
  type HabitStats,
  habitTarget,
} from "@/features/habits/lib/types";

type HabitCardProps = {
  habit: Habit;
  stats: HabitStats;
  skipped: boolean;
  entry?: HabitEntry | null;
  onToggle: (h: Habit) => void;
  onAdjust: (h: Habit, delta: number) => void;
  onSkip: (h: Habit) => void;
  onClear: (h: Habit) => void;
  onDetail?: (h: Habit) => void;
  onEdit?: (h: Habit) => void;
};

export function HabitCard({
  habit,
  stats,
  skipped,
  entry,
  onToggle,
  onAdjust,
  onSkip,
  onClear,
  onDetail,
  onEdit,
}: HabitCardProps) {
  const accent = hueColor(habit.hue, "ring");
  const target = habitTarget(habit);
  const measurable = habit.type === "measurable";
  const step = habit.step ?? 1;
  const progress = stats.doneToday
    ? 1
    : measurable
      ? Math.min(1, stats.countToday / target)
      : 0;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition sm:p-4 ${
        stats.doneToday
          ? "border-emerald-700/40 bg-emerald-950/20"
          : "border-slate-800/70 bg-slate-950/40 hover:border-slate-700"
      }`}
    >
      {/* Tappable ring: toggles complete/clear (binary) or jumps to target. */}
      <button
        type="button"
        onClick={() => onToggle(habit)}
        aria-pressed={stats.doneToday}
        aria-label={
          stats.doneToday
            ? `Mark ${habit.name} not done`
            : `Complete ${habit.name}`
        }
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <HabitRing
          progress={progress}
          color={stats.doneToday ? "#34d399" : accent}
          size={46}
        >
          {stats.doneToday ? (
            <Check className="h-5 w-5 text-emerald-300" />
          ) : (
            <span className="text-lg leading-none" aria-hidden="true">
              {habit.emoji}
            </span>
          )}
        </HabitRing>
      </button>

      {/* Name + sub-line. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-100">
            {habit.name}
          </p>
          {stats.currentStreak > 0 && (
            <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 tabular-nums">
              🔥 {stats.currentStreak}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {skipped ? (
            <span className="text-slate-400">
              Skipped today ·{" "}
              <button
                type="button"
                onClick={() => onClear(habit)}
                className="underline-offset-2 hover:text-slate-200 hover:underline"
              >
                undo
              </button>
            </span>
          ) : measurable ? (
            <span className="tabular-nums">
              {stats.countToday}/{target} {habit.unit ?? ""} · {scheduleLabel(habit)}
            </span>
          ) : (
            <>{scheduleLabel(habit)}</>
          )}
        </p>
        {entry?.note && (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            📝 {entry.note}
            {entry.at ? <span className="text-slate-500"> · {entry.at}</span> : null}
          </p>
        )}
      </div>

      {/* Right side: measurable stepper, else a skip affordance. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {measurable && !skipped && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAdjust(habit, -step)}
              aria-label={`Decrease ${habit.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onAdjust(habit, step)}
              aria-label={`Increase ${habit.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              +
            </button>
          </div>
        )}
        {!stats.doneToday && !skipped && (
          <button
            type="button"
            onClick={() => onSkip(habit)}
            className="rounded-full px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
          >
            Skip
          </button>
        )}
        {onDetail && (
          <button
            type="button"
            onClick={() => onDetail(habit)}
            aria-label={`Add note or time for ${habit.name}`}
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
            title="Note / time"
          >
            <Note className="h-4 w-4" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(habit)}
            aria-label={`Edit ${habit.name}`}
            className="rounded-full px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export default HabitCard;
