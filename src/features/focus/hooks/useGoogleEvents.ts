"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgendaEvent } from "@/app/api/google/events/route";

export type { AgendaEvent };

/**
 * Read side of Google Calendar: pulls upcoming events (next ~90 days) across
 * all calendars from /api/google/events. Inert unless `enabled`; exposes a
 * manual `refresh` and a `loading`/`error` state.
 */
export function useGoogleEvents(enabled: boolean) {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/google/events");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events?: AgendaEvent[] };
      setEvents(data.events ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }
    refresh();
  }, [enabled, refresh]);

  return { events, loading, error, refresh };
}
