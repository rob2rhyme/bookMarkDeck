"use client";

import {
  FocusMode,
  MODE_LABELS,
  useFocusTimer,
} from "@/features/focus/hooks/useFocusTimer";
import type { FocusSettings } from "@/features/focus/lib/settings";

const MODES: FocusMode[] = ["focus", "short", "long"];

const MODE_ACCENT: Record<
  FocusMode,
  { ring: string; text: string; button: string }
> = {
  focus: {
    ring: "stroke-blue-500",
    text: "text-blue-300",
    button: "bg-blue-600 hover:bg-blue-500",
  },
  short: {
    ring: "stroke-emerald-500",
    text: "text-emerald-300",
    button: "bg-emerald-600 hover:bg-emerald-500",
  },
  long: {
    ring: "stroke-violet-500",
    text: "text-violet-300",
    button: "bg-violet-600 hover:bg-violet-500",
  },
};

const SIZE = 220;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type PomodoroTimerProps = {
  settings: FocusSettings;
  email?: string | null;
  connected?: boolean;
  activeTaskId?: string | null;
  activeTaskName?: string | null;
  onFocusComplete?: (focusMin: number, taskId: string | null) => void;
};

export function PomodoroTimer({
  settings,
  email,
  connected,
  activeTaskId,
  activeTaskName,
  onFocusComplete,
}: PomodoroTimerProps) {
  const {
    mode,
    display,
    running,
    completedToday,
    untilLongBreak,
    progress,
    toggle,
    reset,
    switchMode,
  } = useFocusTimer({
    settings,
    email,
    connected,
    activeTaskId,
    onFocusComplete,
  });

  const accent = MODE_ACCENT[mode];

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
      {/* Mode switcher */}
      <div className="inline-flex rounded-full border border-slate-800 bg-slate-950/60 p-1">
        {MODES.map((m) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                active
                  ? "bg-slate-800 text-slate-50 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          );
        })}
      </div>

      {/* Active task */}
      <p className="mt-4 max-w-full truncate px-2 text-center text-sm text-slate-400">
        {activeTaskName ? (
          <>
            Working on{" "}
            <span className="font-medium text-slate-200">{activeTaskName}</span>
          </>
        ) : (
          "No task selected — pick one to track time."
        )}
      </p>

      {/* Circular progress */}
      <div className="relative mt-4 flex items-center justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            className="fill-none stroke-slate-800"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            className={`fill-none ${accent.ring} transition-[stroke-dashoffset] duration-500 ease-linear`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums text-slate-50 sm:text-5xl">
            {display}
          </span>
          <span
            className={`mt-1 text-xs font-medium uppercase tracking-wide ${accent.text}`}
          >
            {MODE_LABELS[mode]}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`min-w-28 rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition ${accent.button}`}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
        >
          Reset
        </button>
      </div>

      <p className="mt-5 text-center text-xs text-slate-400">
        {completedToday === 0
          ? "No focus blocks finished yet today."
          : `${completedToday} focus ${
              completedToday === 1 ? "block" : "blocks"
            } done today.`}
        <span className="mx-1.5 text-slate-600">·</span>
        {untilLongBreak === 1
          ? "Long break next."
          : `${untilLongBreak} until a long break.`}
      </p>
    </div>
  );
}

export default PomodoroTimer;
