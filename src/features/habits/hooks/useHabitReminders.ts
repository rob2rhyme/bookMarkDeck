"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cancelPush, schedulePush } from "@/features/focus/lib/push";
import { nextReminderAt } from "@/features/habits/lib/reminders";
import type { Habit, HabitStats } from "@/features/habits/lib/types";

type Sched = { fireAt: number; messageId: string | null };
type Perm = NotificationPermission | "unsupported";

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

function reminderBody(h: Habit): string {
  if (h.identity) return `Time to ${h.name.toLowerCase()} — ${h.identity}.`;
  return `Time for ${h.name}.`;
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
  const [permission, setPermission] = useState<Perm>("unsupported");
  const mapRef = useRef<Record<string, Sched>>({});
  const runningRef = useRef(false);

  useEffect(() => {
    mapRef.current = load(email);
  }, [email]);

  useEffect(() => {
    if (typeof Notification === "undefined") setPermission("unsupported");
    else setPermission(Notification.permission);
  }, []);

  // A compact signature of the desired schedule — re-reconcile when it changes.
  const signature = useMemo(
    () =>
      habits
        .map(
          (h) =>
            `${h.id}:${h.reminder ?? ""}:${
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

        // Drop reminders for habits that no longer exist.
        for (const id of Object.keys(map)) {
          if (!activeIds.has(id)) {
            await cancelPush(map[id].messageId);
            delete map[id];
          }
        }

        for (const h of habits) {
          const done = statsByHabit.get(h.id)?.doneToday ?? false;
          const desired = nextReminderAt(h, now, done);
          const cur = map[h.id];
          if (desired === null) {
            if (cur) {
              await cancelPush(cur.messageId);
              delete map[h.id];
            }
            continue;
          }
          // Already scheduled for ~the same minute — leave it.
          if (cur && Math.abs(cur.fireAt - desired) < 60_000) continue;
          if (cur) await cancelPush(cur.messageId);
          const messageId = await schedulePush({
            endTime: desired,
            title: `${h.emoji} ${h.name}`,
            body: reminderBody(h),
            url: "/habits",
          });
          map[h.id] = { fireAt: desired, messageId };
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
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }, []);

  const hasReminders = habits.some((h) => Boolean(h.reminder));

  return { permission, requestPermission, hasReminders };
}
