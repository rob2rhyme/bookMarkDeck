"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * The signed-in email, resilient to a session that goes null while this
 * device is offline. `src/app/providers.tsx` already stops next-auth's own
 * tab from refetching on focus while offline, but next-auth also posts a
 * cross-tab broadcast after every session fetch — a failed one included —
 * and every OTHER open tab answers it unconditionally, bypassing that guard
 * and the null-session skip both. Review found this nulls every hidden tab's
 * session too, not just a focused one's: a cup taken then was recorded
 * nowhere, and the outbox was never handed over.
 *
 * A null read while offline is treated as that known, unreachable broadcast,
 * not a sign-out: the last email keeps being returned until a real value
 * comes back. A null read while online goes through as a real sign-out.
 *
 * The effect below is keyed on `session` (next-auth's own object, a fresh
 * reference on every real fetch — even one that confirms the same data),
 * never on `online`. Review also found the browser's bare `online` event
 * nulling the stable email the instant connectivity returns, before any
 * refetch actually happens: next-auth's own `online` handling only gates an
 * unconfigured `refetchInterval` poll, it never itself re-fetches. Keying on
 * `online` let that stale, still-offline-suppressed null through the moment
 * `online` turned true, which is exactly the broadcast null above, just
 * delayed. `online` is still read fresh inside the effect (closures always
 * see the render that triggered them); it just never decides *whether* the
 * effect reruns.
 *
 * Residual, same as `providers.tsx`'s: a captive portal (or any genuinely
 * unreachable server) reports online, so a null there still goes through.
 */
export function useStableEmail(): string | null {
  const { data: session } = useSession();
  const liveEmail = session?.user?.email ?? null;
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [stable, setStable] = useState(liveEmail);
  useEffect(() => {
    if (liveEmail !== null || online) setStable(liveEmail);
    // Deliberately keyed on `session` alone below, not `liveEmail`/`online`;
    // see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  return stable;
}
