"use client";

import { useEffect, useState } from "react";

import {
  subscribeMeditationSessions,
  type MeditationSessionRecord,
} from "@/features/focus/data/focusData";

/**
 * Live meditation session records (Firestore `meditationSessions` collection)
 * for the history chart. Empty until connected. Mirrors useHydrationHistory.
 */
export function useMeditationHistory(email?: string | null, connected = false) {
  const [sessions, setSessions] = useState<MeditationSessionRecord[]>([]);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setSessions([]);
      return;
    }
    return subscribeMeditationSessions(email, setSessions);
  }, [canSync, email]);

  return sessions;
}
