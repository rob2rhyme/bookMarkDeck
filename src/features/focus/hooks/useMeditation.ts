"use client";

// Meditation timer — breathing pacer or a plain timed sit. Timestamp-based so it
// stays accurate when backgrounded (same approach as useFocusTimer). On
// completion it chimes, notifies, persists a meditationSession, and logs a
// timeline activity. The hook owns state; the card is presentational.

import { useCallback, useEffect, useRef, useState } from "react";

import { patternById, phaseAt } from "@/features/focus/lib/breathing";
import {
  type AmbientId,
  initAudio,
  playChime,
  type SoundId,
  startAmbient,
  stopAmbient,
} from "@/features/focus/lib/sound";
import {
  cancelSpeech,
  primeVoices,
  speak,
} from "@/features/focus/lib/voice";
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
  /** Spoken phase/step cues via the Web Speech API. */
  voice?: boolean;
  /** Generated backdrop while a session runs ("off" by default). */
  ambient?: AmbientId;
  onLog?: (type: ActivityType, summary: string, day?: string) => void;
};

export function useMeditation({
  email,
  connected = false,
  soundEnabled,
  chimeSound,
  voice = false,
  ambient = "off",
  onLog,
}: UseMeditationArgs) {
  const [running, setRunning] = useState(false);
  const [durationSec, setDurationSec] = useState(300);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  // Current step index for a running guided meditation (drives the highlight).
  const [guideStep, setGuideStep] = useState(0);

  const endTimeRef = useRef<number | null>(null);
  const kindRef = useRef<MeditationKind>("breath");
  const patternRef = useRef<string | null>(null);
  const minutesRef = useRef(0);
  const stepsRef = useRef<string[]>([]);
  // Spoken-cue bookkeeping: last phase/step already voiced (-1 = none yet).
  const lastPhaseRef = useRef(-1);
  const lastStepRef = useRef(-1);

  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const ambientRef = useRef(ambient);
  ambientRef.current = ambient;

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
    stopAmbient();
    cancelSpeech();
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
      const elapsed = durationSec - left;
      setElapsedSec(elapsed);

      // Spoken cues: a breath phase label on each transition, or a guide step
      // as the session moves evenly through its steps.
      if (voiceRef.current) {
        if (kindRef.current === "breath") {
          const p = patternById(patternRef.current ?? "box");
          const { index, phase } = phaseAt(p, elapsed);
          if (index !== lastPhaseRef.current) {
            lastPhaseRef.current = index;
            speak(phase.label);
          }
        } else if (kindRef.current === "guide") {
          const steps = stepsRef.current;
          if (steps.length > 0) {
            const per = durationSec / steps.length;
            const si = Math.min(
              steps.length - 1,
              Math.max(0, Math.floor(elapsed / per))
            );
            if (si !== lastStepRef.current) {
              lastStepRef.current = si;
              setGuideStep(si);
              speak(steps[si]);
            }
          }
        }
      }

      if (left <= 0) completeRef.current();
    }, 200);
    return () => clearInterval(id);
  }, [running, durationSec]);

  // Stop audio/speech if the card unmounts mid-session.
  useEffect(() => {
    return () => {
      stopAmbient();
      cancelSpeech();
    };
  }, []);

  const start = useCallback(
    (opts: {
      kind: MeditationKind;
      patternId?: string;
      minutes: number;
      steps?: string[];
    }) => {
      if (soundEnabled) {
        initAudio();
        playChime("break", chimeSound); // a soft tone to begin
      }
      requestNotificationPermission();
      if (voiceRef.current) primeVoices();
      startAmbient(ambientRef.current);
      kindRef.current = opts.kind;
      patternRef.current = opts.kind === "breath" ? opts.patternId ?? "box" : null;
      stepsRef.current = opts.kind === "guide" ? opts.steps ?? [] : [];
      minutesRef.current = opts.minutes;
      lastPhaseRef.current = -1;
      lastStepRef.current = -1;
      setGuideStep(0);
      setDurationSec(opts.minutes * 60);
      setElapsedSec(0);
      endTimeRef.current = Date.now() + opts.minutes * 60 * 1000;
      setRunning(true);
    },
    [soundEnabled, chimeSound]
  );

  const stop = useCallback(() => {
    stopAmbient();
    cancelSpeech();
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
    guideStep,
    start,
    stop,
  };
}
