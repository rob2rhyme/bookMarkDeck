"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { pickRediscover } from "@/features/inventory/lib/rediscover";
import type { InventoryItem } from "@/features/inventory/lib/types";

const BASE_KEY = "bookmarkdeck:inventory:rediscover:v1";
const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

/**
 * The daily "rediscover" pick + a per-day dismiss. Hydration-safe: nothing shows
 * until after mount and until `today` is known; dismissing hides it only for the
 * rest of that day (a new pick returns tomorrow). The dismissed day is a tiny
 * per-user localStorage flag — no cloud write.
 */
export function useRediscover(
  email: string | null | undefined,
  items: InventoryItem[],
  today: string
) {
  const [dismissedDay, setDismissedDay] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setDismissedDay(window.localStorage.getItem(keyFor(email)));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [email]);

  const dismiss = useCallback(() => {
    if (!today) return;
    setDismissedDay(today);
    try {
      window.localStorage.setItem(keyFor(email), today);
    } catch {
      /* ignore */
    }
  }, [email, today]);

  const item = useMemo(
    () =>
      hydrated && today && dismissedDay !== today
        ? pickRediscover(items, today)
        : null,
    [hydrated, today, dismissedDay, items]
  );

  return { item, dismiss };
}
