"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ActivityType,
  fetchHydration,
  hydrationTransport,
  subscribeHydration,
} from "@/features/focus/data/focusData";
import { playChime } from "@/features/focus/lib/sound";
import { notify } from "@/features/focus/lib/notify";
import { todayKey } from "@/lib/dayKey";
import { readHydrationCache, writeHydrationCache } from "@/lib/focusHydrationCache";
import { flushHydration, recordHydration } from "@/lib/hydrationOutbox";

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
 *
 * Every cup added or removed goes to the cloud as an increment, through the
 * outbox (@/lib/hydrationOutbox), so cups taken on several devices or in
 * several tabs add up; the count on screen takes whatever the record says and
 * is never written back. It used to be: the last count written won, so a
 * laptop offline for an hour replaced the phone's cups with its own number.
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
  // The count on screen, kept in step with it synchronously, so an action works
  // from the latest count and makes its writes outside a state updater — which
  // StrictMode runs twice.
  const countRef = useRef(0);
  // The day whose record the server has answered for since it was followed.
  // Until it has, the total isn't known, so the log doesn't state one.
  const answeredRef = useRef<string | null>(null);
  const emailRef = useRef(email);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    emailRef.current = email;
  }, [email]);

  const show = useCallback((n: number) => {
    countRef.current = n;
    setCups(n);
  }, []);

  /** Make `d` the current day, starting from what this device cached for it. */
  const loadDay = useCallback(
    (d: string) => {
      dayRef.current = d;
      const cached = readHydrationCache(email, d);
      show(cached?.cups ?? 0);
      lastDrinkRef.current = cached?.lastDrink ?? Date.now();
      setDay(d);
    },
    [email, show]
  );

  /**
   * Move to the new day if the date has changed. Writes nothing to the new day:
   * an absent record already reads as 0, and the new day's record may hold cups
   * another device logged while this tab slept. Changes still on their way to
   * the day being left are in the outbox under that day.
   */
  const rollIfNewDay = useCallback((): boolean => {
    const today = todayKey();
    if (today === dayRef.current) return false;
    loadDay(today);
    setReminding(false);
    return true;
  }, [loadDay]);

  // Hand the outbox's changes to the server. Only while connected: otherwise
  // sending would ask to sign in.
  const flush = useCallback(async () => {
    if (canSync && email) await flushHydration(email, hydrationTransport);
  }, [canSync, email]);

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
  // a tab whose timers slept. They, and the network coming back, are also when
  // changes left in the outbox are handed over — `connected` is sign-in state,
  // and doesn't change when the network does.
  useEffect(() => {
    if (!hydrated) return;
    const roll = () => void rollIfNewDay();
    const wake = () => {
      rollIfNewDay();
      void flush();
    };
    const online = () => void flush();
    const id = setInterval(roll, 15000);
    window.addEventListener("focus", wake);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [hydrated, rollIfNewDay, flush]);

  // Follow the current day's count for live cross-browser updates. Every
  // snapshot is taken as the count: the SDK lays this page's unacknowledged
  // changes over it, so they show. Cache-only answers are held back until the
  // server has answered (serverFirst) — offline, a record another device wrote
  // reads as missing from the cache. The first answer is also when the outbox
  // is handed over.
  useEffect(() => {
    if (!canSync || !email || !day) return;
    const unsubscribe = subscribeHydration(
      email,
      day,
      (remote) => {
        if (day !== dayRef.current) return; // a late snapshot of a day already left
        show(remote ?? 0);
        if (answeredRef.current !== day) {
          answeredRef.current = day;
          void flushHydration(email, hydrationTransport);
        }
      },
      { serverFirst: true }
    );
    return () => {
      unsubscribe();
      answeredRef.current = null;
    };
  }, [canSync, email, day, show]);

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
    const next = countRef.current + 1;
    show(next);
    if (email) recordHydration(email, dayRef.current, 1, { send: canSync }, hydrationTransport);
    lastDrinkRef.current = Date.now();
    setReminding(false);
    // Before the day's record has been read the total isn't known — other
    // devices' cups aren't in it yet — so the log doesn't claim one.
    const known = !canSync || answeredRef.current === dayRef.current;
    onLog?.(
      "hydration",
      known
        ? `Drank a cup of water (${next} ${next === 1 ? "cup" : "cups"} today)`
        : "Drank a cup of water"
    );
  }, [canSync, email, onLog, rollIfNewDay, show]);

  const removeCup = useCallback(() => {
    rollIfNewDay();
    if (countRef.current <= 0) return;
    show(countRef.current - 1);
    if (email) recordHydration(email, dayRef.current, -1, { send: canSync }, hydrationTransport);
  }, [canSync, email, rollIfNewDay, show]);

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
    show(remote ?? 0);
  }, [canSync, email, rollIfNewDay, show]);

  // "Sync to cloud" hands over what the outbox holds. It never writes the count
  // on screen: that would replace the cups other devices have logged.
  const pushToCloud = flush;

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
