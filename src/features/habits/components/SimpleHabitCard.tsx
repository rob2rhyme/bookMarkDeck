"use client";

// Beginner-first habit card for the Simple view. One obvious primary action
// (a labelled "Done" pill for yes/no habits, a clear -/+ stepper for measurable
// ones); everything secondary (Skip, Note, Focus) lives behind a single
// overflow menu. Leaves the shared HabitCard — and the Classic view — untouched.

import { useEffect, useRef, useState } from "react";

import { Check, DotsHorizontal, Emoji, Note, Timer } from "@/components/icons";
import { HabitRing } from "@/features/habits/components/HabitRing";
import { habitEmoji, hueColor, scheduleLabel } from "@/features/habits/lib/format";
import { type Habit, type HabitStats, habitTarget } from "@/features/habits/lib/types";

type SimpleHabitCardProps = {
  habit: Habit;
  stats: HabitStats;
  skipped: boolean;
  canUndo?: boolean;
  onToggle: (h: Habit) => void;
  onAdjust: (h: Habit, delta: number) => void;
  onSkip: (h: Habit) => void;
  onClear: (h: Habit) => void;
  onUndo: (h: Habit) => void;
  onDetail: (h: Habit) => void;
  onFocus: (h: Habit) => void;
};

export function SimpleHabitCard({
  habit,
  stats,
  skipped,
  canUndo,
  onToggle,
  onAdjust,
  onSkip,
  onClear,
  onUndo,
  onDetail,
  onFocus,
}: SimpleHabitCardProps) {
  const accent = hueColor(habit.hue, "ring");
  const measurable = habit.type === "measurable";
  const target = habitTarget(habit);
  const step = habit.step ?? 1;
  const done = stats.doneToday;
  const progress = done ? 1 : measurable ? Math.min(1, stats.countToday / target) : 0;
  const sched = scheduleLabel(habit);

  // Plain-language sub-line: teaches the model where it's used.
  let subline: string;
  if (measurable) {
    subline = `${stats.countToday} / ${target} ${habit.unit ?? ""} · ${sched}`.trim();
  } else if (habit.schedule.type === "timesPerWeek" && stats.weekTarget) {
    subline = `${stats.weekDone ?? 0} / ${stats.weekTarget} this week · ${sched}`;
  } else {
    subline = `Yes / no · ${sched}`;
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const runFromMenu = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition sm:p-4 ${
        done
          ? "border-emerald-700/40 bg-emerald-950/20"
          : skipped
            ? "border-slate-800/70 bg-slate-950/30 opacity-80"
            : "border-slate-800/70 bg-slate-950/40 hover:border-slate-700"
      }`}
    >
      {/* Visual status ring (not the tap target — the labelled control is). */}
      <HabitRing
        progress={progress}
        color={done ? "#34d399" : accent}
        size={44}
        className="shrink-0"
      >
        {done ? (
          <Check className="h-5 w-5 text-emerald-300" />
        ) : (
          <span className="text-lg leading-none">
            <Emoji>{habitEmoji(habit)}</Emoji>
          </span>
        )}
      </HabitRing>

      {/* Name + plain sub-line. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-100">{habit.name}</p>
          {stats.currentStreak > 0 && (
            <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 tabular-nums">
              🔥 {stats.currentStreak}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-500">
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
          ) : (
            subline
          )}
        </p>
      </div>

      {/* Primary action + overflow. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {!skipped &&
          (measurable ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAdjust(habit, -step)}
                aria-label={`Decrease ${habit.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-base text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onAdjust(habit, step)}
                aria-label={`Add ${step} to ${habit.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-base text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onToggle(habit)}
              aria-pressed={done}
              className={`inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-sm font-medium leading-none transition ${
                done
                  ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
                  : "bg-blue-600 text-white hover:bg-blue-500"
              }`}
            >
              {done ? "✓ Done" : "Done"}
            </button>
          ))}

        {/* Undo for measurable (binary's pill already toggles back). */}
        {!skipped && measurable && canUndo && (
          <button
            type="button"
            onClick={() => onUndo(habit)}
            aria-label={`Undo last change to ${habit.name}`}
            title="Undo last change"
            className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            ↩
          </button>
        )}

        {/* Overflow: Skip / Note / Focus. */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={`More options for ${habit.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
          >
            <DotsHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl">
              {!done && !skipped && (
                <button
                  type="button"
                  onClick={() => runFromMenu(() => onSkip(habit))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                >
                  ⤼ Skip today
                </button>
              )}
              <button
                type="button"
                onClick={() => runFromMenu(() => onDetail(habit))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
              >
                <Note className="h-4 w-4 text-slate-400" /> Note / time
              </button>
              <button
                type="button"
                onClick={() => runFromMenu(() => onFocus(habit))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
              >
                <Timer className="h-4 w-4 text-slate-400" /> Start focus
              </button>
              <p className="border-t border-slate-800/60 px-3 py-2 text-[11px] leading-snug text-slate-500">
                Skip keeps your streak. Use the ⋯ menu anytime.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SimpleHabitCard;
