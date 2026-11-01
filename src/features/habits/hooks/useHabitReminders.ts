"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cancelPush, pushSupported, requestPushPermission, schedulePush } from "@/lib/push";
import { clearSnooze, readSnoozes } from "@/lib/snoozeRecords";
import { nextReminderAt, reminderBody, reminderTimes } from "@/features/habits/lib/reminders";
import type { Habit, HabitStats } from "@/features/habits/lib/types";

type Sched = { fireAt: number; messageId: string | null };
/**
 * "checking" is the pre-effect state and is deliberately distinct from
 * "unsupported": both render nothing, but conflating them would flash the
 * "notifications aren't set up" line on first paint of a deployment where push
 * works fine, before the effect below has run.
 */
type Perm = NotificationPermission | "unsupported" | "checking";

const KEY = "bd:habit-reminders:v1";

function keyFor(email?: string | null) {
  return email ? `${KEY}:${email}` : KEY;
}
function load(email?: string | null): Record<string, Sched> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function save(email: string | null | undefined, map: Record<string, Sched>) {
  try {
    window.localStorage.setItem(keyFor(email), JSON.stringify(map));
  } catch {}
}

/**
 * Per-habit push reminders. Schedules the next fire (within the 24h push window)
 * for each habit with a reminder time, re-arms as state changes, and SUPPRESSES
 * a reminder the moment its habit is completed/skipped (cancels the queued push).
 * Best-effort + permission-gated: no-ops without notification permission, VAPID,
 * or QStash (and on localhost). Re-arms on each visit for habits beyond 24h.
 */
export function useHabitReminders(
  email: string | null | undefined,
  habits: Habit[],
  statsByHabit: Map<string, HabitStats>,
  today: string
) {
  const [permission, setPermission] = useState<Perm>("checking");
  const mapRef = useRef<Record<string, Sched>>({});
  const runningRef = useRef(false);

  useEffect(() => {
    mapRef.current = load(email);
  }, [email]);

  // "unsupported" means push cannot work here AT ALL — which includes a
  // deployment with no VAPID key, not just a browser without Notification.
  // Checking only the browser is what let the dashboards offer "Turn on
  // reminders" on a deployment where scheduling always no-ops: the prompt was
  // granted and the reminder could never fire, with nothing saying so.
  useEffect(() => {
    setPermission(pushSupported() ? Notification.permission : "unsupported");
  }, []);

  // A compact signature of the desired schedule — re-reconcile when it changes.
  const signature = useMemo(
    () =>
      habits
        .map(
          (h) =>
            `${h.id}:${reminderTimes(h).join(",")}:${
              statsByHabit.get(h.id)?.doneToday ? 1 : 0
            }`
        )
        .join("|"),
    [habits, statsByHabit]
  );

  useEffect(() => {
    if (permission !== "granted" || typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const now = new Date();
        const map = { ...mapRef.current };
        const activeIds = new Set(habits.map((h) => h.id));

        // One queued push per habit AND time, keyed `{id}@{HH:MM}`. (Before
        // several times were allowed the key was just the id; those entries are
        // not in this set, so they are cancelled and re-queued under the new key.)
        const desired = new Map<string, { habit: Habit; at: number }>();
        for (const h of habits) {
          const done = statsByHabit.get(h.id)?.doneToday ?? false;
          for (const time of reminderTimes(h)) {
            const at = nextReminderAt(h, now, done, time);
            if (at !== null) desired.set(`${h.id}@${time}`, { habit: h, at });
          }
        }

        // Drop what is no longer wanted: a deleted habit, a removed time, or a
        // habit finished for the day.
        for (const key of Object.keys(map)) {
          if (!desired.has(key)) {
            await cancelPush(map[key].messageId);
            delete map[key];
          }
        }

        for (const [key, { habit: h, at }] of desired) {
          const cur = map[key];
          // Already scheduled for ~the same minute — leave it.
          if (cur && Math.abs(cur.fireAt - at) < 60_000) continue;
          if (cur) await cancelPush(cur.messageId);
          // One tag per habit, not per time: a later reminder replaces an
          // unread earlier one for the same habit rather than stacking.
          const messageId = await schedulePush({
            endTime: at,
            title: `${h.emoji} ${h.name}`,
            body: reminderBody(h, statsByHabit.get(h.id)?.currentStreak ?? 0),
            url: "/habits",
            tag: `habit:${h.id}`,
            snoozable: true,
          });
          map[key] = { fireAt: at, messageId };
        }

        // A snoozed reminder (queued by the notification's own button) goes
        // quiet once its habit is done or gone — the worker can't hear that.
        const nowMs = now.getTime();
        for (const snz of await readSnoozes()) {
          if (!snz.tag.startsWith("habit:")) continue;
          const id = snz.tag.slice("habit:".length);
          const done = statsByHabit.get(id)?.doneToday ?? false;
          if (!activeIds.has(id) || done) {
            await cancelPush(snz.messageId);
            await clearSnooze(snz.tag);
          } else if (snz.fireAt < nowMs - 60_000) {
            await clearSnooze(snz.tag);
          }
        }

        if (!cancelled) {
          mapRef.current = map;
          save(email, map);
        }
      } finally {
        runningRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permission, signature, today, email, habits, statsByHabit]);

  const requestPermission = useCallback(async () => {
    if (!pushSupported()) return;
    const granted = await requestPushPermission();
    setPermission(granted ? "granted" : Notification.permission);
  }, []);

  const hasReminders = habits.some((h) => reminderTimes(h).length > 0);

  return { permission, requestPermission, hasReminders };
}
