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
  }, [liveEmail, online]);
  return stable;
}
