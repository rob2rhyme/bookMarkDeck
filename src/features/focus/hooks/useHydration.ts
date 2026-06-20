"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { playChime } from "@/features/focus/lib/sound";
import { notify } from "@/features/focus/lib/notify";

type HydrationArgs = {
  email?: string | null;
  enabled: boolean;
  intervalMin: number;
  goal: number;
  soundEnabled: boolean;
};

const BASE_KEY = "bookmarkdeck:focus:hydration:v1";

function todayStr(): string {
  return new Date().toDateString();
}

/**
 * Per-day hydration tracker (localStorage, keyed per user). Orthogonal to the
 * synced focus data, so it intentionally stays local-only.
 */
export function useHydration({
  email,
  enabled,
  intervalMin,
  goal,
  soundEnabled,
}: HydrationArgs) {
  const [glasses, setGlasses] = useState(0);
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
          setGlasses(typeof d.glasses === "number" ? d.glasses : 0);
          lastDrinkRef.current =
            typeof d.lastDrink === "number" ? d.lastDrink : Date.now();
        } else {
          setGlasses(0);
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
          glasses,
          lastDrink: lastDrinkRef.current,
        })
      );
    } catch {}
  }, [glasses, hydrated, key]);

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
        setGlasses(0);
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
      notify("Time to hydrate", "Take a sip of water.");
      if (soundEnabled) playChime("hydration");
    }
  }, [reminding, enabled, soundEnabled]);

  const drink = useCallback(() => {
    setGlasses((g) => g + 1);
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, []);

  const removeGlass = useCallback(() => {
    setGlasses((g) => Math.max(0, g - 1));
  }, []);

  const dismiss = useCallback(() => {
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, []);

  return { hydrated, glasses, goal, reminding, drink, removeGlass, dismiss };
}
