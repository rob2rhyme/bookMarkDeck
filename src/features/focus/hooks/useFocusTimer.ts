"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FocusMode = "focus" | "short" | "long";

export const MODE_LABELS: Record<FocusMode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

export const MODE_MINUTES: Record<FocusMode, number> = {
  focus: 25,
  short: 5,
  long: 15,
};

/** After this many completed focus blocks, the next break is a long one. */
const SESSIONS_BEFORE_LONG = 4;

const secondsFor = (mode: FocusMode) => MODE_MINUTES[mode] * 60;

/**
 * In-memory Pomodoro state machine (Phase 2 — no persistence yet).
 * Hydration-safe: initial values are deterministic (no Date/localStorage reads
 * during render); the ticking interval only runs client-side after a user start.
 */
export function useFocusTimer() {
  const [mode, setMode] = useState<FocusMode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(() => secondsFor("focus"));
  const [running, setRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const switchMode = useCallback((next: FocusMode) => {
    clearTick();
    setRunning(false);
    setMode(next);
    setSecondsLeft(secondsFor(next));
  }, []);

  const start = useCallback(() => {
    setSecondsLeft((s) => (s <= 0 ? s : s));
    setRunning((r) => (r ? r : true));
  }, []);

  const pause = useCallback(() => setRunning(false), []);

  const reset = useCallback(() => {
    clearTick();
    setRunning(false);
    setSecondsLeft(secondsFor(mode));
  }, [mode]);

  // Drive the countdown while running.
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return clearTick;
  }, [running]);

  // Advance to the next mode when a block completes.
  useEffect(() => {
    if (secondsLeft !== 0 || !running) return;
    clearTick();
    setRunning(false);
    if (mode === "focus") {
      const nextCount = completedFocus + 1;
      setCompletedFocus(nextCount);
      const nextMode: FocusMode =
        nextCount % SESSIONS_BEFORE_LONG === 0 ? "long" : "short";
      setMode(nextMode);
      setSecondsLeft(secondsFor(nextMode));
    } else {
      setMode("focus");
      setSecondsLeft(secondsFor("focus"));
    }
  }, [secondsLeft, running, mode, completedFocus]);

  const total = secondsFor(mode);
  const progress = total > 0 ? 1 - secondsLeft / total : 0;

  return {
    mode,
    secondsLeft,
    running,
    completedFocus,
    total,
    progress,
    start,
    pause,
    reset,
    switchMode,
  };
}
