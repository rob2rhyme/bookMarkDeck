"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type ActivityEvent,
  type ActivityType,
  deleteActivity,
  logActivity,
  restoreActivity,
  subscribeActivity,
} from "@/features/focus/data/focusData";
import { todayKey } from "@/lib/dayKey";

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
    // Live updates — reflects this and other devices in real time.
    return subscribeActivity(email, setEvents);
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

  const remove = useCallback(
    (id: string) => {
      if (!canSync || !email) return;
      setEvents((prev) => prev.filter((e) => e.id !== id));
      deleteActivity(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const restore = useCallback(
    (event: ActivityEvent) => {
      if (!canSync || !email) return;
      setEvents((prev) =>
        prev.some((e) => e.id === event.id) ? prev : [event, ...prev]
      );
      restoreActivity(email, event).catch(() => {});
    },
    [canSync, email]
  );

  return { events, log, remove, restore };
}
