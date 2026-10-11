"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { pickRediscoverBookmark } from "@/utils/rediscoverBookmark";
import type { Bookmark } from "@/types/bookmark";
import { todayKey } from "@/lib/dayKey";

const BASE_KEY = "bookmarkdeck:rediscover:v1";
const keyFor = (userId?: string | null) =>
  userId ? `${BASE_KEY}:${userId}` : BASE_KEY;

/**
 * The daily "rediscover a bookmark" pick + a per-day dismiss. Hydration-safe:
 * `today` and the dismissed flag are read only after mount (no Date/localStorage
 * during render), so nothing surfaces until then. Dismissing hides it for the
 * rest of the day; a fresh pick returns tomorrow. Dismiss is a tiny per-user
 * localStorage flag — no cloud write.
 */
export function useRediscoverBookmark(
  userId: string | null | undefined,
  bookmarks: Bookmark[]
) {
  const [today, setToday] = useState("");
  const [dismissedDay, setDismissedDay] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToday(todayKey());
    try {
      setDismissedDay(window.localStorage.getItem(keyFor(userId)));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [userId]);

  const dismiss = useCallback(() => {
    if (!today) return;
    setDismissedDay(today);
    try {
      window.localStorage.setItem(keyFor(userId), today);
    } catch {
      /* ignore */
    }
  }, [userId, today]);

  const bookmark = useMemo(
    () =>
      hydrated && today && dismissedDay !== today
        ? pickRediscoverBookmark(bookmarks, today)
        : null,
    [hydrated, today, dismissedDay, bookmarks]
  );

  return { bookmark, dismiss };
}
