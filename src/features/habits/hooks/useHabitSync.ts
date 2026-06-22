"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth, ensureFirebaseGoogleAuth } from "@/lib/firebase";

/**
 * Firebase Auth connection for habit sync. Silently reflects an existing
 * Firebase session (e.g. from bookmark/focus sync) via onAuthStateChanged, and
 * connects interactively on demand. Kept local so the feature stays removable.
 */
export function useHabitSync(email: string | null | undefined) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setConnected(Boolean(user)));
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
