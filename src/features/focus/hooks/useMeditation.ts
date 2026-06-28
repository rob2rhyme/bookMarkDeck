"use client";

// Meditation timer — breathing pacer or a plain timed sit. Timestamp-based so it
// stays accurate when backgrounded (same approach as useFocusTimer). On
// completion it chimes, notifies, persists a meditationSession, and logs a
// timeline activity. The hook owns state; the card is presentational.

import { useCallback, useEffect, useRef, useState } from "react";

import { patternById } from "@/features/focus/lib/breathing";
import {
  initAudio,
  playChime,
  type SoundId,
} from "@/features/focus/lib/sound";
import {
  notify,
  requestNotificationPermission,
} from "@/features/focus/lib/notify";
import {
  logMeditationSession,
  subscribeMeditationSessions,
  todayKey,
  type ActivityType,
  type MeditationKind,
} from "@/features/focus/data/focusData";

type UseMeditationArgs = {
  email?: string | null;
  connected?: boolean;
  soundEnabled: boolean;
  chimeSound: SoundId;
  onLog?: (type: ActivityType, summary: string, day?: string) => void;
};

export function useMeditation({
  email,
  connected = false,
  soundEnabled,
  chimeSound,
  onLog,
}: UseMeditationArgs) {
  const [running, setRunning] = useState(false);
  const [durationSec, setDurationSec] = useState(300);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);

  const endTimeRef = useRef<number | null>(null);
  const kindRef = useRef<MeditationKind>("breath");
  const patternRef = useRef<string | null>(null);
  const minutesRef = useRef(0);

  // Today's logged meditation minutes (cross-device, from the cloud).
  useEffect(() => {
    if (!connected || !email) {
      setTodayMinutes(0);
      return;
    }
    const unsub = subscribeMeditationSessions(email, (rows) => {
      const today = todayKey();
      setTodayMinutes(
        rows.filter((r) => r.day === today).reduce((s, r) => s + r.minutes, 0)
      );
    });
    return () => unsub();
  }, [connected, email]);

  const complete = useCallback(() => {
    if (soundEnabled) {
      initAudio();
      playChime("session", chimeSound);
    }
    const min = minutesRef.current;
    notify("Meditation complete", `${min} min of calm — nicely done.`, {
      tag: "meditation",
    });
    if (connected && email && min >= 1) {
      const pat = patternRef.current;
      const k = kindRef.current;
      logMeditationSession(email, min, todayKey(), k, pat).catch(() => {});
      const label =
        k === "breath"
          ? `${patternById(pat ?? "box").name} breathing`
          : k === "guide"
            ? "Guided meditation"
            : "Quiet sit";
      onLog?.("meditation", `${label} — ${min} min`, todayKey());
    }
    endTimeRef.current = null;
    setRunning(false);
    setElapsedSec(0);
  }, [soundEnabled, chimeSound, connected, email, onLog]);

  const completeRef = useRef(complete);
  completeRef.current = complete;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const end = endTimeRef.current;
      if (end == null) return;
      const left = Math.max(0, (end - Date.now()) / 1000);
      setElapsedSec(durationSec - left);
      if (left <= 0) completeRef.current();
    }, 200);
    return () => clearInterval(id);
  }, [running, durationSec]);

  const start = useCallback(
    (opts: { kind: MeditationKind; patternId?: string; minutes: number }) => {
      if (soundEnabled) {
        initAudio();
        playChime("break", chimeSound); // a soft tone to begin
      }
      requestNotificationPermission();
      kindRef.current = opts.kind;
      patternRef.current = opts.kind === "breath" ? opts.patternId ?? "box" : null;
      minutesRef.current = opts.minutes;
      setDurationSec(opts.minutes * 60);
      setElapsedSec(0);
      endTimeRef.current = Date.now() + opts.minutes * 60 * 1000;
      setRunning(true);
    },
    [soundEnabled, chimeSound]
  );

  const stop = useCallback(() => {
    endTimeRef.current = null;
    setRunning(false);
    setElapsedSec(0);
  }, []);

  return {
    running,
    durationSec,
    elapsedSec,
    remainingSec: Math.max(0, durationSec - elapsedSec),
    todayMinutes,
    start,
    stop,
  };
}
