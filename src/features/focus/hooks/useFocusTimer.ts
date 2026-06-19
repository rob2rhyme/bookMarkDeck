"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  countSessionsForDay,
  logSession,
  todayKey,
} from "@/features/focus/data/focusData";

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
 * In-memory Pomodoro state machine with optional Firestore persistence.
 * Hydration-safe: initial values are deterministic (no Date/localStorage reads
 * during render); the ticking interval only runs client-side after a user start.
 * When `connected` with an `email`, today's completed-block count is seeded from
 * Firestore and each finished focus block is logged (failures are non-blocking).
 */
export function useFocusTimer(email?: string | null, connected = false) {
  const [mode, setMode] = useState<FocusMode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(() => secondsFor("focus"));
  const [running, setRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canSync = connected && Boolean(email);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Seed today's completed-block count from Firestore once connected.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    countSessionsForDay(email, todayKey())
      .then((count) => {
        if (!cancelled) setCompletedFocus(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  const switchMode = useCallback((next: FocusMode) => {
    clearTick();
    setRunning(false);
    setMode(next);
    setSecondsLeft(secondsFor(next));
  }, []);

  const start = useCallback(() => {
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

  // Advance to the next mode when a block completes (and log focus blocks).
  useEffect(() => {
    if (secondsLeft !== 0 || !running) return;
    clearTick();
    setRunning(false);
    if (mode === "focus") {
      setCompletedFocus((count) => count + 1);
      if (canSync && email) {
        logSession(email, MODE_MINUTES.focus, todayKey()).catch(() => {});
      }
      // Decide the next break from the just-incremented count.
      const nextMode: FocusMode =
        (completedFocus + 1) % SESSIONS_BEFORE_LONG === 0 ? "long" : "short";
      setMode(nextMode);
      setSecondsLeft(secondsFor(nextMode));
    } else {
      setMode("focus");
      setSecondsLeft(secondsFor("focus"));
    }
  }, [secondsLeft, running, mode, completedFocus, canSync, email]);

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
