"use client";

import { useState } from "react";

import { TimeUpModal } from "@/features/focus/components/TimeUpModal";
import { logSession, todayKey } from "@/features/focus/data/focusData";
import {
  FocusMode,
  MODE_LABELS,
  useFocusTimer,
} from "@/features/focus/hooks/useFocusTimer";
import { useStopwatch } from "@/features/focus/hooks/useStopwatch";
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
  const [intention, setIntention] = useState("");
  const {
    mode,
    display,
    running,
    completedToday,
    untilLongBreak,
    progress,
    alert,
    setReflection,
    dismissAlert,
    toggle,
    reset,
    switchMode,
  } = useFocusTimer({
    settings,
    email,
    connected,
    activeTaskId,
    intention,
    onFocusComplete,
  });

  const accent = MODE_ACCENT[mode];

  const [kind, setKind] = useState<"pomodoro" | "stopwatch">("pomodoro");
  const stopwatch = useStopwatch();

  // Log the open-ended block through the same path as a Pomodoro focus session.
  const finishStopwatch = () => {
    const minutes = Math.floor(stopwatch.elapsed / 60);
    if (minutes >= 1) {
      const taskId = activeTaskId ?? null;
      if (connected && email) {
        logSession(email, minutes, todayKey(), taskId, intention).catch(() => {});
      }
      onFocusComplete?.(minutes, taskId);
      setIntention("");
    }
    stopwatch.reset();
  };

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
      {/* Pomodoro vs open-ended stopwatch */}
      <div className="mb-3 inline-flex rounded-full border border-slate-800 bg-slate-950/60 p-1 text-xs font-medium">
        {(
          [
            ["pomodoro", "Pomodoro"],
            ["stopwatch", "Stopwatch"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 transition ${
              kind === k
                ? "bg-slate-800 text-slate-50 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mode switcher (Pomodoro only) */}
      {kind === "pomodoro" && (
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
      )}

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

      {/* Intention — logged with this focus block (Session-style). */}
      {(kind === "stopwatch" || mode === "focus") && (
        <input
          type="text"
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder="What's your intention for this block? (optional)"
          aria-label="Focus intention"
          className="mt-3 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-center text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-400"
        />
      )}

      {kind === "pomodoro" ? (
        <>
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
        </>
      ) : (
        <>
          {/* Stopwatch — counts up, logs whole minutes when finished. */}
          <div className="relative mt-4 flex h-[220px] w-[220px] items-center justify-center rounded-full border-[12px] border-slate-800">
            <div className="flex flex-col items-center">
              <span className="text-4xl font-semibold tabular-nums text-slate-50 sm:text-5xl">
                {stopwatch.display}
              </span>
              <span className="mt-1 text-xs font-medium uppercase tracking-wide text-blue-300">
                Counting up
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={stopwatch.toggle}
              className="min-w-28 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              {stopwatch.running ? "Pause" : "Start"}
            </button>
            <button
              type="button"
              onClick={finishStopwatch}
              disabled={stopwatch.elapsed < 1}
              className="rounded-full border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Finish
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            {stopwatch.elapsed >= 60
              ? `Logs ${Math.floor(stopwatch.elapsed / 60)} min when you finish.`
              : "Runs open-ended — logs whole minutes of focus when you finish."}
          </p>
        </>
      )}

      <TimeUpModal
        completedMode={alert}
        settings={settings}
        onReflect={setReflection}
        onClose={dismissAlert}
      />
    </div>
  );
}

export default PomodoroTimer;
