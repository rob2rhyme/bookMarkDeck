"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth, ensureFirebaseGoogleAuth } from "@/lib/firebase";

/**
 * Manages the Firebase Auth connection used to persist filing data. A thin
 * filing-local copy of the inventory/focus sync hook (kept separate so the
 * pillar stays removable):
 * - Silently reflects an existing Firebase session (e.g. from a prior bookmark
 *   or focus sync) via onAuthStateChanged — no popup.
 * - `connect()` performs the one-time interactive sign-in when the user opts in.
 */
export function useFilingSync(email: string | null | undefined) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setConnected(Boolean(user));
    });
    return unsub;
  }, []);

  const connect = useCallback(async () => {
    if (!email) {
      setError("Sign in to your account first.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await ensureFirebaseGoogleAuth(email);
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to sync.");
    } finally {
      setConnecting(false);
    }
  }, [email]);

  return { connected, connecting, error, connect };
}
