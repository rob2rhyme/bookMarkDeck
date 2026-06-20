"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ActivityType,
  fetchHydration,
  saveHydration,
  todayKey,
} from "@/features/focus/data/focusData";
import { playChime } from "@/features/focus/lib/sound";
import { notify } from "@/features/focus/lib/notify";

type LogActivity = (type: ActivityType, summary: string) => void;

type HydrationArgs = {
  email?: string | null;
  connected?: boolean;
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
 * Per-day hydration tracker. Counts whole cups; ounces are derived (1 cup =
 * 8 oz). Cached in localStorage and, when connected, synced to Firestore
 * (focusHydration/{YYYY-MM-DD}) so the count follows the account across
 * browsers. Each cup is also mirrored to the activity log.
 */
export function useHydration({
  email,
  connected = false,
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
  const cupsRef = useRef(0);
  const key = email ? `${BASE_KEY}:${email}` : BASE_KEY;
  const canSync = connected && Boolean(email);

  useEffect(() => {
    cupsRef.current = cups;
  }, [cups]);

  const persistRemote = useCallback(
    (value: number) => {
      if (canSync && email) saveHydration(email, todayKey(), value).catch(() => {});
    },
    [canSync, email]
  );

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

  // Persist locally.
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

  // On connect, reconcile today's count with Firestore. Take the higher of
  // local vs remote so neither a cross-browser bump nor an offline one is lost,
  // then write the resolved value back so both ends converge.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    fetchHydration(email, todayKey())
      .then((remote) => {
        if (cancelled || remote == null) return;
        const resolved = Math.max(cupsRef.current, remote);
        setCups(resolved);
        if (resolved !== remote) saveHydration(email, todayKey(), resolved).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

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
        persistRemote(0);
        lastDrinkRef.current = Date.now();
        setReminding(false);
        return;
      }
      if (Date.now() - lastDrinkRef.current >= intervalMin * 60 * 1000) {
        setReminding(true);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [enabled, intervalMin, persistRemote]);

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
      persistRemote(next);
      onLog?.(
        "hydration",
        `Drank a cup of water (${next} ${next === 1 ? "cup" : "cups"} today)`
      );
      return next;
    });
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, [onLog, persistRemote]);

  const removeCup = useCallback(() => {
    setCups((c) => {
      const next = Math.max(0, c - 1);
      persistRemote(next);
      return next;
    });
  }, [persistRemote]);

  const dismiss = useCallback(() => {
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, []);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const remote = await fetchHydration(email, todayKey());
    setCups(remote ?? 0);
  }, [canSync, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await saveHydration(email, todayKey(), cupsRef.current);
  }, [canSync, email]);

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
    pullFromCloud,
    pushToCloud,
  };
}
