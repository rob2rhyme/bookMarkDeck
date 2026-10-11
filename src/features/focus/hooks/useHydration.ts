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
  // The day the count belongs to: state as well as a ref, so the live record
  // follows it past midnight.
  const [day, setDay] = useState("");

  const lastDrinkRef = useRef<number>(0);
  const dayRef = useRef<string>("");
  const cupsRef = useRef(0);
  // False from the moment a day's record starts being followed until its first
  // snapshot is read. Writing before that could put this device's count over a
  // higher one another device already logged; the first snapshot max-merges.
  const remoteReadyRef = useRef(false);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    cupsRef.current = cups;
  }, [cups]);

  const persistRemote = useCallback(
    (value: number) => {
      if (canSync && email && remoteReadyRef.current) {
        saveHydration(email, dayRef.current, value).catch(() => {});
      }
    },
    [canSync, email]
  );

  /** Make `d` the current day, starting from what this device cached for it. */
  const loadDay = useCallback(
    (d: string) => {
      dayRef.current = d;
      const cached = readHydrationCache(email, d);
      setCups(cached?.cups ?? 0);
      lastDrinkRef.current = cached?.lastDrink ?? Date.now();
      setDay(d);
    },
    [email]
  );

  /**
   * Move to the new day if the date has changed. Writes nothing remote: an
   * absent record already reads as 0, and the new day's record may hold cups
   * another device logged while this tab slept — it used to write 0 over them.
   */
  const rollIfNewDay = useCallback((): boolean => {
    const today = todayKey();
    if (today === dayRef.current) return false;
    remoteReadyRef.current = false;
    loadDay(today);
    setReminding(false);
    return true;
  }, [loadDay]);

  // Load today's progress after mount (the cache is shared with habits).
  useEffect(() => {
    loadDay(todayKey());
    setHydrated(true);
  }, [loadDay]);

  // Persist locally, under the day the count belongs to. The cache drops a write
  // for a day that is no longer today, so a tab that hasn't rolled yet can't
  // stamp yesterday's count as today's.
  useEffect(() => {
    if (!hydrated) return;
    writeHydrationCache(email, dayRef.current, cups, lastDrinkRef.current);
  }, [cups, hydrated, email]);

  // The day rolls over on its own clock. It used to live in the reminder loop,
  // so with reminders off nothing noticed midnight; focus and visibility catch
  // a tab whose timers slept.
  useEffect(() => {
    if (!hydrated) return;
    const roll = () => void rollIfNewDay();
    const id = setInterval(roll, 15000);
    window.addEventListener("focus", roll);
    document.addEventListener("visibilitychange", roll);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", roll);
      document.removeEventListener("visibilitychange", roll);
    };
  }, [hydrated, rollIfNewDay]);

  // Follow the current day's count for live cross-browser updates. The first
  // snapshot reconciles via max-merge (so neither a cross-device nor an offline
  // bump is lost); later snapshots adopt the remote value.
  useEffect(() => {
    if (!canSync || !email || !day) return;
    remoteReadyRef.current = false;
    let first = true;
    return subscribeHydration(email, day, (remote) => {
      if (day !== dayRef.current) return; // a late snapshot of a day already left
      if (first) {
        first = false;
        remoteReadyRef.current = true;
        const resolved = Math.max(cupsRef.current, remote ?? 0);
        if (remote != null) setCups(resolved);
        if (resolved !== (remote ?? 0)) saveHydration(email, day, resolved).catch(() => {});
        return;
      }
      if (remote != null) setCups(remote);
    });
  }, [canSync, email, day]);

  // Reminder loop.
  useEffect(() => {
    if (!enabled) {
      setReminding(false);
      return;
    }
    const id = setInterval(() => {
      if (rollIfNewDay()) return;
      if (Date.now() - lastDrinkRef.current >= intervalMin * 60 * 1000) {
        setReminding(true);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [enabled, intervalMin, rollIfNewDay]);

  // Fire a notification/chime when a reminder appears.
  useEffect(() => {
    if (reminding && enabled) {
      notify("Time to drink a cup", "Pour yourself a cup of water.");
      if (soundEnabled) playChime("hydration");
    }
  }, [reminding, enabled, soundEnabled]);

  const drink = useCallback(() => {
    rollIfNewDay();
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
  }, [onLog, persistRemote, rollIfNewDay]);

  const removeCup = useCallback(() => {
    rollIfNewDay();
    setCups((c) => {
      const next = Math.max(0, c - 1);
      persistRemote(next);
      return next;
    });
  }, [persistRemote, rollIfNewDay]);

  const dismiss = useCallback(() => {
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, []);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    rollIfNewDay();
    const d = dayRef.current;
    const remote = await fetchHydration(email, d);
    if (d === dayRef.current) setCups(remote ?? 0);
  }, [canSync, email, rollIfNewDay]);

  // An explicit upload: the day and the count it writes are a pair.
  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await saveHydration(email, dayRef.current, cupsRef.current);
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
