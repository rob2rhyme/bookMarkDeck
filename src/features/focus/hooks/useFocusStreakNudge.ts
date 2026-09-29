"use client";

import { useEffect, useRef, useState } from "react";

import { cancelPush, schedulePush } from "@/lib/push";
import {
  focusStreakBody,
  focusStreakNudgeAt,
  shouldNudgeFocusStreak,
} from "@/features/focus/lib/streakNudge";

type Perm = NotificationPermission | "unsupported";
type Sched = { fireAt: number; messageId: string | null };

const KEY = "bd:focus-streak-nudge:v1";
const keyFor = (email?: string | null) => (email ? `${KEY}:${email}` : KEY);

function persist(email: string | null | undefined, val: Sched | null) {
  try {
    if (val) window.localStorage.setItem(keyFor(email), JSON.stringify(val));
    else window.localStorage.removeItem(keyFor(email));
  } catch {
    /* ignore */
  }
}

/**
 * Evening "keep your focus streak" nudge. Schedules a single push (within the
 * 24h window) when the streak is at risk — streak >= 2 and no session logged
 * today — and cancels it the moment a session lands. Best-effort +
 * permission-gated: no-ops without notification permission / VAPID / QStash
 * (and on localhost), so it stays dormant until push is configured.
 */
export function useFocusStreakNudge(
  email: string | null | undefined,
  streak: number,
  todaySessions: number
) {
  const [permission, setPermission] = useState<Perm>("unsupported");
  const schedRef = useRef<Sched | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (typeof Notification === "undefined") setPermission("unsupported");
    else setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(keyFor(email));
      schedRef.current = raw ? JSON.parse(raw) : null;
    } catch {
      schedRef.current = null;
    }
  }, [email]);

  useEffect(() => {
    if (permission !== "granted" || typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const cur = schedRef.current;
        const fireAt = shouldNudgeFocusStreak(streak, todaySessions)
          ? focusStreakNudgeAt(new Date())
          : null;

        if (!fireAt) {
          // Session logged, no streak, or past the evening hour — clear any push.
          if (cur) {
            await cancelPush(cur.messageId);
            schedRef.current = null;
            persist(email, null);
          }
          return;
        }
        // Already scheduled for ~the same minute — leave it.
        if (cur && Math.abs(cur.fireAt - fireAt) < 60_000) return;
        if (cur) await cancelPush(cur.messageId);
        const messageId = await schedulePush({
          endTime: fireAt,
          title: "🔥 Focus streak",
          body: focusStreakBody(streak),
          url: "/focus",
          tag: "focus-streak",
        });
        if (!cancelled) {
          schedRef.current = { fireAt, messageId };
          persist(email, schedRef.current);
        }
      } finally {
        runningRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permission, email, streak, todaySessions]);
}
