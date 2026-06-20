"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  countSessionsForDay,
  logSession,
  todayKey,
} from "@/features/focus/data/focusData";
import { initAudio, playChime } from "@/features/focus/lib/sound";
import {
  notify,
  requestNotificationPermission,
} from "@/features/focus/lib/notify";
import { cancelPush, schedulePush } from "@/features/focus/lib/push";
import type { FocusSettings } from "@/features/focus/lib/settings";

export type FocusMode = "focus" | "short" | "long";

export const MODE_LABELS: Record<FocusMode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

type UseFocusTimerArgs = {
  settings: FocusSettings;
  email?: string | null;
  connected?: boolean;
  activeTaskId?: string | null;
  /** Called after a focus block is logged (focusMin, taskId at completion). */
  onFocusComplete?: (focusMin: number, taskId: string | null) => void;
};

function format(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Settings-driven Pomodoro state machine. Timestamp-based (accurate when the
 * tab is backgrounded), with optional sound, notifications, auto-start, and
 * Firestore session logging. Hydration-safe: initial state is deterministic and
 * the interval only runs after a user gesture.
 */
export function useFocusTimer({
  settings,
  email,
  connected = false,
  activeTaskId,
  onFocusComplete,
}: UseFocusTimerArgs) {
  const durationFor = useCallback(
    (mode: FocusMode) => settings[mode] * 60,
    [settings]
  );

  const [mode, setMode] = useState<FocusMode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(() => settings.focus * 60);
  const [running, setRunning] = useState(false);
  const [completedToday, setCompletedToday] = useState(0);

  const canSync = connected && Boolean(email);

  // Refs so the interval callback reads the latest values without restarting.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef(0);
  const runningRef = useRef(false);
  const modeRef = useRef<FocusMode>("focus");
  const secondsLeftRef = useRef(settings.focus * 60);
  const completedRef = useRef(0);
  const settingsRef = useRef(settings);
  const taskRef = useRef<string | null | undefined>(activeTaskId);
  const lastModeDurRef = useRef(settings.focus * 60);
  const handleCompleteRef = useRef<() => void>(() => {});
  const startWithRef = useRef<(seconds: number) => void>(() => {});
  // Background push scheduling (server-fired at the block's end time).
  const pushIdRef = useRef<string | null>(null);
  const pushGenRef = useRef(0);

  const stopPush = () => {
    pushGenRef.current += 1;
    if (pushIdRef.current) {
      cancelPush(pushIdRef.current);
      pushIdRef.current = null;
    }
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);
  useEffect(() => {
    completedRef.current = completedToday;
  }, [completedToday]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    taskRef.current = activeTaskId;
  }, [activeTaskId]);

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
        if (!cancelled) {
          setCompletedToday(count);
          completedRef.current = count;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  const transitionTo = useCallback((next: FocusMode, auto: boolean) => {
    modeRef.current = next;
    setMode(next);
    const dur = settingsRef.current[next] * 60;
    lastModeDurRef.current = dur;
    secondsLeftRef.current = dur;
    setSecondsLeft(dur);
    if (auto) startWithRef.current(dur);
  }, []);

  handleCompleteRef.current = () => {
    // Foreground completion — we alert in-page below, so cancel the push.
    stopPush();
    const completed = modeRef.current;
    const s = settingsRef.current;
    if (completed === "focus") {
      const newCount = completedRef.current + 1;
      completedRef.current = newCount;
      setCompletedToday(newCount);
      const taskId = taskRef.current ?? null;
      if (canSync && email) {
        logSession(email, s.focus, todayKey(), taskId).catch(() => {});
      }
      onFocusComplete?.(s.focus, taskId);
      if (s.soundEnabled) playChime("session", s.chimeSound);
      notify("Focus session complete", "Nice work — time for a break.");
      const isLong = newCount % s.sessionsUntilLong === 0;
      transitionTo(isLong ? "long" : "short", s.autoStartBreaks);
    } else {
      if (s.soundEnabled) playChime("break", s.chimeSound);
      notify("Break over", "Back to focus.");
      transitionTo("focus", s.autoStartFocus);
    }
  };

  startWithRef.current = (seconds: number) => {
    clearTick();
    endTimeRef.current = Date.now() + seconds * 1000;
    runningRef.current = true;
    setRunning(true);

    // Schedule a server-fired push for this block's end, so the alert lands
    // even if the tab is backgrounded. Cancelled on pause/reset/foreground end.
    stopPush();
    const gen = pushGenRef.current;
    const m = modeRef.current;
    schedulePush({
      endTime: endTimeRef.current,
      title: m === "focus" ? "Focus session complete" : "Break over",
      body:
        m === "focus" ? "Nice work — time for a break." : "Back to focus.",
    }).then((id) => {
      if (pushGenRef.current === gen) pushIdRef.current = id;
      else cancelPush(id);
    });

    intervalRef.current = setInterval(() => {
      const left = Math.max(
        0,
        Math.round((endTimeRef.current - Date.now()) / 1000)
      );
      secondsLeftRef.current = left;
      setSecondsLeft(left);
      if (left <= 0) {
        clearTick();
        runningRef.current = false;
        setRunning(false);
        handleCompleteRef.current();
      }
    }, 250);
  };

  const start = useCallback(() => {
    initAudio(); // unlock audio from this user gesture
    requestNotificationPermission();
    startWithRef.current(secondsLeftRef.current);
  }, []);

  const pause = useCallback(() => {
    clearTick();
    stopPush();
    const left = Math.max(
      0,
      Math.round((endTimeRef.current - Date.now()) / 1000)
    );
    secondsLeftRef.current = left;
    setSecondsLeft(left);
    runningRef.current = false;
    setRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (runningRef.current) pause();
    else start();
  }, [pause, start]);

  const reset = useCallback(() => {
    clearTick();
    stopPush();
    runningRef.current = false;
    setRunning(false);
    const dur = settingsRef.current[modeRef.current] * 60;
    lastModeDurRef.current = dur;
    secondsLeftRef.current = dur;
    setSecondsLeft(dur);
  }, []);

  const switchMode = useCallback((next: FocusMode) => {
    clearTick();
    stopPush();
    runningRef.current = false;
    setRunning(false);
    modeRef.current = next;
    setMode(next);
    const dur = settingsRef.current[next] * 60;
    lastModeDurRef.current = dur;
    secondsLeftRef.current = dur;
    setSecondsLeft(dur);
  }, []);

  // When durations change in settings and we're idle, snap to the new value.
  useEffect(() => {
    const dur = durationFor(modeRef.current);
    if (!runningRef.current && dur !== lastModeDurRef.current) {
      lastModeDurRef.current = dur;
      secondsLeftRef.current = dur;
      setSecondsLeft(dur);
    }
  }, [durationFor]);

  useEffect(
    () => () => {
      clearTick();
      stopPush();
    },
    []
  );

  const total = durationFor(mode);
  const progress = total > 0 ? 1 - secondsLeft / total : 0;
  const untilLongBreak =
    settings.sessionsUntilLong - (completedToday % settings.sessionsUntilLong);

  return {
    mode,
    secondsLeft,
    display: format(secondsLeft),
    running,
    progress,
    completedToday,
    untilLongBreak,
    toggle,
    reset,
    switchMode,
  };
}
