"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ActivityType,
  logReset as persistReset,
  type ResetRecord,
  subscribeResets,
  todayKey,
} from "@/features/focus/data/focusData";
import { countOnDay, resetStreak } from "@/features/focus/lib/letThem";

type LogActivity = (type: ActivityType, summary: string, day?: string) => void;

/**
 * "Let them" resets: logs a completed reset to Firestore + the unified activity
 * timeline, and exposes today's count + the current streak. Mirrors the
 * meditation/hydration pattern — optimistic and fail-safe, cloud-only history.
 */
export function useLetThem(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [resets, setResets] = useState<ResetRecord[]>([]);
  const [localToday, setLocalToday] = useState(0); // offline optimistic count
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setResets([]);
      return;
    }
    return subscribeResets(email, setResets);
  }, [canSync, email]);

  const today = todayKey();
  const todayCount = canSync ? countOnDay(resets, today) : localToday;
  const streak = useMemo(
    () => (canSync ? resetStreak(resets, today) : localToday > 0 ? 1 : 0),
    [canSync, resets, today, localToday]
  );

  const logReset = useCallback(
    (trigger: string, action: string) => {
      const day = todayKey();
      setLocalToday((n) => n + 1);
      if (canSync && email) persistReset(email, { trigger, action, day }).catch(() => {});
      const label = trigger.trim() ? `Reset: ${trigger.trim()}` : "Logged a reset";
      onLog?.("reset", label, day);
    },
    [canSync, email, onLog]
  );

  return { resets, todayCount, streak, logReset };
}
