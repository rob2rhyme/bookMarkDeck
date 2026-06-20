"use client";

import { useEffect, useState } from "react";

import { subscribeHydrationHistory } from "@/features/focus/data/focusData";

export type HydrationDay = { day: string; cups: number };

/**
 * Live per-day hydration totals (Firestore `focusHydration` collection) for the
 * history chart. Empty until connected.
 */
export function useHydrationHistory(email?: string | null, connected = false) {
  const [history, setHistory] = useState<HydrationDay[]>([]);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setHistory([]);
      return;
    }
    return subscribeHydrationHistory(email, setHistory);
  }, [canSync, email]);

  return history;
}
