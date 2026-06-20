"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type ActivityType } from "@/features/focus/data/focusData";
import { playChime } from "@/features/focus/lib/sound";
import { notify } from "@/features/focus/lib/notify";

type LogActivity = (type: ActivityType, summary: string) => void;

type HydrationArgs = {
  email?: string | null;
  enabled: boolean;
  intervalMin: number;
  goal: number;
  soundEnabled: boolean;
  onLog?: LogActivity;
};

/** Ounces in one cup of water. */
export const OZ_PER_CUP = 8;

const BASE_KEY = "bookmarkdeck:focus:hydration:v1";

function todayStr(): string {
  return new Date().toDateString();
}

/**
 * Per-day hydration tracker (localStorage, keyed per user). Counts whole cups;
 * ounces are derived (1 cup = 8 oz). Orthogonal to the synced focus data, so it
 * intentionally stays local-only — but each cup is mirrored to the activity log.
 */
export function useHydration({
  email,
  enabled,
  intervalMin,
  goal,
  soundEnabled,
  onLog,
}: HydrationArgs) {
  const [cups, setCups] = useState(0);
  const [reminding, setReminding] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const lastDrinkRef = useRef<number>(0);
  const dayRef = useRef<string>("");
  const key = email ? `${BASE_KEY}:${email}` : BASE_KEY;

  // Load today's progress after mount.
  useEffect(() => {
    dayRef.current = todayStr();
    lastDrinkRef.current = Date.now();
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.date === todayStr()) {
          // `cups` is the current field; `glasses` is the legacy field name.
          const stored =
            typeof d.cups === "number"
              ? d.cups
              : typeof d.glasses === "number"
                ? d.glasses
                : 0;
          setCups(stored);
          lastDrinkRef.current =
            typeof d.lastDrink === "number" ? d.lastDrink : Date.now();
        } else {
          setCups(0);
        }
      }
    } catch {}
    setHydrated(true);
  }, [key]);

  // Persist.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          date: todayStr(),
          cups,
          lastDrink: lastDrinkRef.current,
        })
      );
    } catch {}
  }, [cups, hydrated, key]);

  // Reminder loop.
  useEffect(() => {
    if (!enabled) {
      setReminding(false);
      return;
    }
    const id = setInterval(() => {
      const t = todayStr();
      if (t !== dayRef.current) {
        dayRef.current = t;
        setCups(0);
        lastDrinkRef.current = Date.now();
        setReminding(false);
        return;
      }
      if (Date.now() - lastDrinkRef.current >= intervalMin * 60 * 1000) {
        setReminding(true);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [enabled, intervalMin]);

  // Fire a notification/chime when a reminder appears.
  useEffect(() => {
    if (reminding && enabled) {
      notify("Time to drink a cup", "Pour yourself a cup of water.");
      if (soundEnabled) playChime("hydration");
    }
  }, [reminding, enabled, soundEnabled]);

  const drink = useCallback(() => {
    setCups((c) => {
      const next = c + 1;
      onLog?.(
        "hydration",
        `Drank a cup of water (${next} ${next === 1 ? "cup" : "cups"} today)`
      );
      return next;
    });
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, [onLog]);

  const removeCup = useCallback(() => {
    setCups((c) => Math.max(0, c - 1));
  }, []);

  const dismiss = useCallback(() => {
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, []);

  return {
    hydrated,
    cups,
    oz: cups * OZ_PER_CUP,
    goal,
    goalOz: goal * OZ_PER_CUP,
    reminding,
    drink,
    removeCup,
    dismiss,
  };
}
