"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/**
 * Bridges the single next-auth Google login into Firebase Auth so every pillar
 * (Bookmarks, Focus, Habits, My Stuff) is synced after one sign-in — no more
 * per-app "Sign in to sync" prompts.
 *
 * Renders nothing. On the first authenticated load it waits for Firebase to
 * settle its persisted session; if none is restored, it fetches the user's
 * Google id_token and exchanges it for a Firebase session (silent, no popup).
 * Once Firebase is signed in, each feature's onAuthStateChanged flips to
 * "connected" automatically. Best-effort: any failure leaves the existing
 * interactive "Sign in to sync" button as the fallback — no regression.
 *
 * Firebase is imported dynamically (client-only) so the firebase-heavy module
 * never enters the app shell's server/prerender graph — matching how the rest
 * of the shell avoids pulling in firebase.ts.
 */
export function FirebaseSyncBridge() {
  const { status } = useSession();
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || attempted.current) return;

    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      const [{ auth, bridgeFirebaseFromIdToken }, { onAuthStateChanged }] =
        await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      if (cancelled) return;

      // The first onAuthStateChanged fires once Firebase has resolved
      // persistence, so we only bridge when there's genuinely no session to
      // restore.
      unsub = onAuthStateChanged(auth, async (user) => {
        if (cancelled || attempted.current) return;
        attempted.current = true;
        if (user) return; // already signed in (persisted or prior bridge)
        try {
          const res = await fetch("/api/firebase-token", { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const { idToken } = (await res.json()) as { idToken: string | null };
          if (!idToken || cancelled || auth.currentUser) return;
          await bridgeFirebaseFromIdToken(idToken);
        } catch {
          // Offline / token unavailable — the interactive connect stays available.
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [status]);

  return null;
}
