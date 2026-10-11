"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ActivityType,
  fetchHydration,
  saveHydration,
  subscribeHydration,
} from "@/features/focus/data/focusData";
import { playChime } from "@/features/focus/lib/sound";
import { notify } from "@/features/focus/lib/notify";
import { todayKey } from "@/lib/dayKey";
import { readHydrationCache, writeHydrationCache } from "@/lib/focusHydrationCache";

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

  // Load today's progress after mount (the cache is shared with habits).
  useEffect(() => {
    dayRef.current = todayKey();
    const cached = readHydrationCache(email, dayRef.current);
    setCups(cached?.cups ?? 0);
    lastDrinkRef.current = cached?.lastDrink ?? Date.now();
    setHydrated(true);
  }, [email]);

  // Persist locally.
  useEffect(() => {
    if (!hydrated) return;
    writeHydrationCache(email, todayKey(), cups, lastDrinkRef.current);
  }, [cups, hydrated, email]);

  // Subscribe to today's count for live cross-browser updates. The first
  // snapshot reconciles via max-merge (so neither a cross-device nor an offline
  // bump is lost); later snapshots adopt the remote value.
  useEffect(() => {
    if (!canSync || !email) return;
    const day = todayKey();
    let first = true;
    return subscribeHydration(email, day, (remote) => {
      if (remote == null) {
        if (first && cupsRef.current > 0) {
          saveHydration(email, day, cupsRef.current).catch(() => {});
        }
        first = false;
        return;
      }
      if (first) {
        const resolved = Math.max(cupsRef.current, remote);
        setCups(resolved);
        if (resolved !== remote) saveHydration(email, day, resolved).catch(() => {});
        first = false;
      } else {
        setCups(remote);
      }
    });
  }, [canSync, email]);

  // Reminder loop.
  useEffect(() => {
    if (!enabled) {
      setReminding(false);
      return;
    }
    const id = setInterval(() => {
      const t = todayKey();
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
