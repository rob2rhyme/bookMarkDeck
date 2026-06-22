"use client";

import { useEffect, useState } from "react";

import { subscribeSessions } from "@/features/focus/data/focusData";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

/**
 * Read-only live view of the user's focus sessions, for the habits feature's
 * focus↔habits correlation + auto-check. Habits depends on focus's data layer
 * (read-only); focus never depends on habits.
 */
export function useFocusSessions(
  email: string | null | undefined,
  connected: boolean
): FocusSessionRecord[] {
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);

  useEffect(() => {
    if (!connected || !email) {
      setSessions([]);
      return;
    }
    const unsub = subscribeSessions(email, setSessions);
    return unsub;
  }, [connected, email]);

  return sessions;
}
