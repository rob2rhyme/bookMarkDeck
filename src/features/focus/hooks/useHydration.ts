"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ActivityType,
  addHydration,
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
  // False from the moment a day's record starts being followed until the
  // server's first answer is read. Writing before that could put this device's
  // count over a higher one another device already logged; that first answer
  // merges instead (see the subscription below).
  const remoteReadyRef = useRef(false);
  // The count a day's record merges against: what this device had for the day
  // when it started following it. Cups added or removed after that, before the
  // first answer, are this device's own changes and are kept on top of the
  // merge. `loadDay` sets it, so a drink that itself rolls the day over is
  // counted as a change, not as part of the base.
  const baseRef = useRef<{ day: string; cups: number } | null>(null);
  // The base the record now being followed will merge against. A Download
  // resets it: adopting the cloud's count is not a change of this device's.
  const mergeBaseRef = useRef(0);
  // The day whose record is being followed right now (null when none), and the
  // account the hook is on — so a base lands on the right gap, and a Download
  // that resolves after an account switch is dropped.
  const followingRef = useRef<string | null>(null);
  const emailRef = useRef(email);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    cupsRef.current = cups;
  }, [cups]);
  useEffect(() => {
    emailRef.current = email;
  }, [email]);

  /** `d`'s count is now known to be `v`: merge against it from here on. */
  const rebase = useCallback((d: string, v: number) => {
    if (followingRef.current === d) mergeBaseRef.current = v;
    else baseRef.current = { day: d, cups: v };
  }, []);

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
      baseRef.current = { day: d, cups: cached?.cups ?? 0 };
      setCups(cached?.cups ?? 0);
      lastDrinkRef.current = cached?.lastDrink ?? Date.now();
      setDay(d);
    },
    [email]
  );

  /**
   * Move to the new day if the date has changed. Writes nothing to the new day:
   * an absent record already reads as 0, and the new day's record may hold cups
   * another device logged while this tab slept — it used to write 0 over them.
   *
   * The day being left may still owe its record a change: cups added or removed
   * before the server answered (offline across midnight). Its count can't be
   * merged without that answer, so the change goes up as an increment, which
   * composes with whatever another device wrote.
   */
  const rollIfNewDay = useCallback((): boolean => {
    const today = todayKey();
    const leaving = dayRef.current;
    if (today === leaving) return false;
    if (canSync && email && !remoteReadyRef.current && followingRef.current === leaving) {
      const owed = cupsRef.current - mergeBaseRef.current;
      if (owed !== 0) addHydration(email, leaving, owed).catch(() => {});
    }
    remoteReadyRef.current = false;
    loadDay(today);
    setReminding(false);
    return true;
  }, [canSync, email, loadDay]);

  // Load today's progress after mount (the cache is shared with habits).
  useEffect(() => {
    loadDay(todayKey());
    setHydrated(true);
  }, [loadDay]);

  // Persist locally, under the day the count belongs to. The cache drops a write
  // for a day that is no longer today, so a tab that hasn't rolled yet can't
  // stamp yesterday's count as today's. `day` is a dependency too: a drink that
  // rolls the day over can land on yesterday's number, and the new day's count
  // still has to be written.
  useEffect(() => {
    if (!hydrated) return;
    writeHydrationCache(email, dayRef.current, cups, lastDrinkRef.current);
  }, [cups, hydrated, email, day]);

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

  // Follow the current day's count for live cross-browser updates. The server's
  // first answer merges: the higher of this device's base and the cloud's count
  // (so neither an offline bump nor another device's is lost), plus whatever
  // this device added or removed since it started following the day. Later
  // snapshots adopt the remote value. Cache-only answers are held back until
  // the server has answered (serverFirst): offline, a record another device
  // wrote reads as missing from the cache.
  useEffect(() => {
    if (!canSync || !email || !day) return;
    remoteReadyRef.current = false;
    mergeBaseRef.current =
      baseRef.current?.day === day ? baseRef.current.cups : cupsRef.current;
    baseRef.current = null;
    followingRef.current = day;
    let first = true;
    const unsubscribe = subscribeHydration(
      email,
      day,
      (remote) => {
        if (day !== dayRef.current) return; // a late snapshot of a day already left
        if (first) {
          first = false;
          remoteReadyRef.current = true;
          const base = mergeBaseRef.current;
          const changed = cupsRef.current - base;
          const resolved = Math.max(0, Math.max(base, remote ?? 0) + changed);
          if (resolved !== cupsRef.current) setCups(resolved);
          if (resolved !== (remote ?? 0)) saveHydration(email, day, resolved).catch(() => {});
          return;
        }
        if (remote != null) setCups(remote);
      },
      { serverFirst: true }
    );
    return () => {
      unsubscribe();
      if (followingRef.current === day) followingRef.current = null;
    };
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
      // Before the day's record has been read the total isn't known yet — the
      // merge may raise it — so the log doesn't claim one.
      const settled = !canSync || remoteReadyRef.current;
      onLog?.(
        "hydration",
        settled
          ? `Drank a cup of water (${next} ${next === 1 ? "cup" : "cups"} today)`
          : "Drank a cup of water"
      );
      return next;
    });
    lastDrinkRef.current = Date.now();
    setReminding(false);
  }, [canSync, onLog, persistRemote, rollIfNewDay]);

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
    // Dropped if the day or the account changed while it was in flight.
    if (d !== dayRef.current || email !== emailRef.current) return;
    rebase(d, remote ?? 0); // adopting the cloud's count is not a local change
    setCups(remote ?? 0);
  }, [canSync, email, rebase, rollIfNewDay]);

  // An explicit upload: the day and the count it writes are a pair. The count
  // it uploads becomes the base, or the merge would add it a second time.
  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const d = dayRef.current;
    const v = cupsRef.current;
    rebase(d, v);
    await saveHydration(email, d, v);
  }, [canSync, email, rebase]);

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
