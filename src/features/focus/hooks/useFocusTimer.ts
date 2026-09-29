"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  countSessionsForDay,
  recordFocusSession,
  todayKey,
  updateSessionMeta,
} from "@/features/focus/data/focusData";
import { initAudio } from "@/features/focus/lib/sound";
import { notify } from "@/features/focus/lib/notify";
import { cancelPush, requestPushPermission, schedulePush } from "@/lib/push";
import {
  cancelNativeTimerAlert,
  ensureNativeNotifPermission,
  scheduleNativeTimerAlert,
} from "@/features/focus/lib/nativeNotify";
import type { FocusSettings } from "@/features/focus/lib/settings";

export type FocusMode = "focus" | "short" | "long";

const TIMER_KEY = "bookmarkdeck:focus:timer:v1";

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
  /** The current focus intention, logged with the next completed focus block. */
  intention?: string;
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
  intention,
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
  // The mode that just finished — drives the on-screen "time's up" modal.
  const [alert, setAlert] = useState<FocusMode | null>(null);

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
  const intentionRef = useRef<string | undefined>(intention);
  const lastSessionIdRef = useRef<string | null>(null);
  const lastModeDurRef = useRef(settings.focus * 60);
  const handleCompleteRef = useRef<(opts?: { skipNotify?: boolean }) => void>(
    () => {}
  );
  const startWithRef = useRef<(seconds: number, schedule?: boolean) => void>(
    () => {}
  );
  // Background push scheduling (server-fired at the block's end time).
  const pushIdRef = useRef<string | null>(null);
  const pushGenRef = useRef(0);

  const stopPush = () => {
    pushGenRef.current += 1;
    if (pushIdRef.current) {
      cancelPush(pushIdRef.current);
      pushIdRef.current = null;
    }
    // Cancel the native (Capacitor) time-sensitive alert too; no-op on the web.
    cancelNativeTimerAlert();
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
  useEffect(() => {
    intentionRef.current = intention;
  }, [intention]);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Persist the live timer so it survives navigation away from /focus and back.
  const persistTimer = () => {
    try {
      window.localStorage.setItem(
        TIMER_KEY,
        JSON.stringify({
          mode: modeRef.current,
          running: runningRef.current,
          endTime: endTimeRef.current,
          secondsLeft: secondsLeftRef.current,
          pushId: pushIdRef.current,
        })
      );
    } catch {}
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
    else persistTimer();
  }, []);

  // Defined during render so it closes over the latest props (canSync, email,
  // onFocusComplete), but published to the ref after commit — writing a ref
  // during render is what React forbids. Both refs seed to a no-op and are only
  // ever invoked from intervals and handlers, so a commit-time write is soon
  // enough; the effects that call them are declared below and so run after these.
  const handleComplete = (opts?: { skipNotify?: boolean }) => {
    // Cancel the push: either we're alerting in-page (foreground), or it has
    // already fired (catch-up on return) so cancelling is a harmless no-op.
    stopPush();
    const completed = modeRef.current;
    const s = settingsRef.current;
    // Surface the on-screen modal (it owns the repeating chime). The system
    // notification stays loud + persistent for a backgrounded/closed tab.
    setAlert(completed);
    const skipNotify = opts?.skipNotify ?? false;
    if (completed === "focus") {
      const newCount = completedRef.current + 1;
      completedRef.current = newCount;
      setCompletedToday(newCount);
      const taskId = taskRef.current ?? null;
      lastSessionIdRef.current = null;
      if (canSync && email) {
        recordFocusSession(email, s.focus, todayKey(), taskId, intentionRef.current)
          .then((id) => {
            lastSessionIdRef.current = id;
          })
          .catch(() => {});
      }
      onFocusComplete?.(s.focus, taskId);
      if (!skipNotify) {
        notify("Focus session complete", "Nice work — time for a break.", {
          requireInteraction: true,
          vibrate: [200, 100, 200],
          tag: "bmd-focus-timer",
        });
      }
      const isLong = newCount % s.sessionsUntilLong === 0;
      transitionTo(isLong ? "long" : "short", s.autoStartBreaks);
    } else {
      if (!skipNotify) {
        notify("Break over", "Back to focus.", {
          requireInteraction: true,
          vibrate: [200, 100, 200],
          tag: "bmd-focus-timer",
        });
      }
      transitionTo("focus", s.autoStartFocus);
    }
  };
  useEffect(() => {
    handleCompleteRef.current = handleComplete;
  });

  // `schedule` defaults to true (a fresh start). Resuming a restored block
  // passes false to reuse the push that's already scheduled server-side.
  const startWith = (seconds: number, schedule = true) => {
    clearTick();
    endTimeRef.current = Date.now() + seconds * 1000;
    runningRef.current = true;
    setRunning(true);

    if (schedule) {
      // Schedule a server-fired push for this block's end, so the alert lands
      // even if the tab is backgrounded, minimized, or navigated away from.
      // Cancelled only on pause/reset/foreground completion — NOT on unmount.
      stopPush();
      const gen = pushGenRef.current;
      const m = modeRef.current;
      const alertTitle =
        m === "focus" ? "Focus session complete" : "Break over";
      const alertBody =
        m === "focus" ? "Nice work — time for a break." : "Back to focus.";
      // Native time-sensitive local notification (breaks through Focus/DND on
      // the iOS app); no-op on the plain web/PWA, where the push below covers it.
      scheduleNativeTimerAlert(endTimeRef.current, alertTitle, alertBody);
      schedulePush({
        endTime: endTimeRef.current,
        title: alertTitle,
        body: alertBody,
        url: "/focus",
        tag: "bmd-focus-timer",
      }).then((id) => {
        if (pushGenRef.current === gen) {
          pushIdRef.current = id;
          persistTimer(); // save the id so a later mount can cancel/reuse it
        } else {
          cancelPush(id);
        }
      });
    }

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
    persistTimer();
  };
  useEffect(() => {
    startWithRef.current = startWith;
  });

  const start = useCallback(() => {
    initAudio(); // unlock audio from this user gesture
    void requestPushPermission(); // tracked, so the push scheduled below waits for it
    ensureNativeNotifPermission(); // native iOS app; no-op on the web
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
    persistTimer();
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
    persistTimer();
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
    persistTimer();
  }, []);

  // Restore a running/paused timer when returning to /focus. No one-time guard:
  // startWithRef clears any prior tick, so re-running (e.g. under StrictMode's
  // double-invoke) is safe and keeps a resumed timer actually ticking.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TIMER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved.mode !== "string") return;
      const savedMode = saved.mode as FocusMode;
      modeRef.current = savedMode;
      setMode(savedMode);
      if (saved.running && typeof saved.endTime === "number") {
        // Adopt the push scheduled before we navigated away so it can be
        // cancelled/reused rather than orphaned (which would double-notify).
        pushIdRef.current =
          typeof saved.pushId === "string" ? saved.pushId : null;
        if (saved.endTime > Date.now()) {
          const remaining = Math.round((saved.endTime - Date.now()) / 1000);
          startWithRef.current(remaining, false); // reuse existing push
        } else {
          // The block ended while we were away — its push already fired the
          // system notification; complete it now (logs the session, shows the
          // modal) so returning to /focus reflects it.
          handleCompleteRef.current({ skipNotify: true });
        }
      } else {
        const dur = settingsRef.current[savedMode] * 60;
        const secs =
          !saved.running && typeof saved.secondsLeft === "number"
            ? saved.secondsLeft
            : dur;
        secondsLeftRef.current = secs;
        setSecondsLeft(secs);
      }
    } catch {}
  }, []);

  // When durations change in settings and we're idle, snap to the new value —
  // but only if the timer was sitting at the old full duration (untouched), so
  // a paused/restored mid-block time isn't reset.
  useEffect(() => {
    const dur = durationFor(modeRef.current);
    if (!runningRef.current && dur !== lastModeDurRef.current) {
      const wasUntouched = secondsLeftRef.current === lastModeDurRef.current;
      lastModeDurRef.current = dur;
      if (wasUntouched) {
        secondsLeftRef.current = dur;
        setSecondsLeft(dur);
      }
    }
  }, [durationFor]);

  // On unmount (e.g. navigating to the bookmarks page) stop ticking but LEAVE
  // the scheduled push in place — that server-fired notification is the only
  // thing that can alert the user when /focus isn't the active window.
  useEffect(() => () => clearTick(), []);

  const total = durationFor(mode);
  const progress = total > 0 ? 1 - secondsLeft / total : 0;
  const untilLongBreak =
    settings.sessionsUntilLong - (completedToday % settings.sessionsUntilLong);

  // Attach a post-block reflection note to the session that just finished.
  const setReflection = useCallback(
    (text: string) => {
      const id = lastSessionIdRef.current;
      if (id && canSync && email) {
        updateSessionMeta(email, id, { reflection: text }).catch(() => {});
      }
    },
    [canSync, email]
  );

  return {
    mode,
    secondsLeft,
    display: format(secondsLeft),
    running,
    progress,
    completedToday,
    untilLongBreak,
    alert,
    setReflection,
    dismissAlert: useCallback(() => setAlert(null), []),
    toggle,
    reset,
    switchMode,
  };
}
