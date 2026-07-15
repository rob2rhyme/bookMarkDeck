"use client";

import { useCallback, useEffect, useState } from "react";

const BASE_KEY = "bookmarkdeck:inventory:starterRooms:dismissed:v1";
const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

/**
 * One-time onboarding nudge to seed common rooms. Hydration-safe: nothing shows
 * until after mount. Once seeded or dismissed it stays hidden (a tiny per-user
 * localStorage flag — no cloud write). `hasLocations` also suppresses it, so a
 * user who already made a location never sees the prompt.
 */
export function useStarterRooms(email: string | null | undefined, hasLocations: boolean) {
  const [dismissed, setDismissed] = useState(true); // default hidden until hydrated
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(keyFor(email)) === "1");
    } catch {
      setDismissed(false);
    }
    setHydrated(true);
  }, [email]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(keyFor(email), "1");
    } catch {
      /* ignore */
    }
  }, [email]);

  return { show: hydrated && !dismissed && !hasLocations, dismiss };
}
