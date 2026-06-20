"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type ActivityEvent,
  type ActivityType,
  fetchActivity,
  logActivity,
  todayKey,
} from "@/features/focus/data/focusData";

/**
 * Synced activity log: task/journal/hydration events that aren't focus
 * sessions. Firestore-only (no localStorage) — the unified timeline merges
 * these with focus sessions and only shows when connected. `log` is optimistic
 * (prepends immediately) and fails safe.
 */
export function useFocusActivity(email?: string | null, connected = false) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    fetchActivity(email)
      .then((remote) => {
        if (!cancelled) setEvents(remote);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  const log = useCallback(
    (type: ActivityType, summary: string, day = todayKey()) => {
      if (!canSync || !email) return;
      const optimistic: ActivityEvent = {
        id: crypto.randomUUID(),
        type,
        summary,
        day,
        createdAt: new Date().toISOString(),
      };
      setEvents((prev) => [optimistic, ...prev]);
      logActivity(email, type, summary, day).catch(() => {});
    },
    [canSync, email]
  );

  return { events, log };
}
