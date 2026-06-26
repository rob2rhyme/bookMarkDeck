"use client";

// Open-ended "count up" focus (Session / Llama Life style) — a plain stopwatch
// kept fully separate from the Pomodoro countdown engine (which owns push
// scheduling + native alerts), so it can't destabilise it. Timestamp-based, so
// it stays accurate when the tab is backgrounded; hydration-safe (starts at 0,
// the interval only runs after a user gesture).

import { useCallback, useEffect, useRef, useState } from "react";

function format(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useStopwatch() {
  const [elapsed, setElapsed] = useState(0); // whole seconds
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef(0); // epoch ms the current run began
  const baseRef = useRef(0); // accumulated seconds from previous runs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => clear(), []);

  const start = useCallback(() => {
    startedAtRef.current = Date.now();
    setRunning(true);
    clear();
    intervalRef.current = setInterval(() => {
      setElapsed(
        baseRef.current + Math.floor((Date.now() - startedAtRef.current) / 1000)
      );
    }, 250);
  }, []);

  const pause = useCallback(() => {
    clear();
    const total =
      baseRef.current + Math.floor((Date.now() - startedAtRef.current) / 1000);
    baseRef.current = total;
    setElapsed(total);
    setRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (running) pause();
    else start();
  }, [running, pause, start]);

  const reset = useCallback(() => {
    clear();
    baseRef.current = 0;
    startedAtRef.current = 0;
    setElapsed(0);
    setRunning(false);
  }, []);

  return { elapsed, running, display: format(elapsed), toggle, reset };
}
