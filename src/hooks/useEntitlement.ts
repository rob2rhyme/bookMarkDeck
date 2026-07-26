"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type EntitlementState = {
  loading: boolean;
  configured: boolean; // is billing set up at all?
  pro: boolean;
};

/**
 * Client-side premium state for UI gating. Reads /api/billing/status once the
 * user is authenticated. `configured` is false when billing isn't set up, so
 * callers can hide upgrade prompts entirely in that case.
 */
export function useEntitlement(): EntitlementState & { refresh: () => void } {
  const { status } = useSession();
  const [state, setState] = useState<EntitlementState>({
    loading: true,
    configured: false,
    pro: false,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") {
      setState({ loading: false, configured: false, pro: false });
      return;
    }
    let alive = true;
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : { configured: false, pro: false }))
      .then((d) => {
        if (alive)
          setState({
            loading: false,
            configured: Boolean(d.configured),
            pro: Boolean(d.pro),
          });
      })
      .catch(() => {
        if (alive) setState({ loading: false, configured: false, pro: false });
      });
    return () => {
      alive = false;
    };
  }, [status, tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
