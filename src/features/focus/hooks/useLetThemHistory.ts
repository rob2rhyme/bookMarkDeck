"use client";

import { useEffect, useState } from "react";

import { type ResetRecord, subscribeResets } from "@/features/focus/data/focusData";

/**
 * Live "Let them" reset records (Firestore `letThemResets`) for the history
 * card. Empty until connected. Mirrors useMeditationHistory.
 */
export function useLetThemHistory(email?: string | null, connected = false) {
  const [resets, setResets] = useState<ResetRecord[]>([]);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setResets([]);
      return;
    }
    return subscribeResets(email, setResets);
  }, [canSync, email]);

  return resets;
}
