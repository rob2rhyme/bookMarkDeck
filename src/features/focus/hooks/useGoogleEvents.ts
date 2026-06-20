"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgendaEvent } from "@/app/api/google/events/route";

export type { AgendaEvent };

/**
 * Read side of Google Calendar: pulls upcoming events (next ~90 days) across
 * all calendars from /api/google/events. Inert unless `enabled`; exposes a
 * manual `refresh` and a `loading`/`error` state.
 */
const DEFAULT_DAYS = 90;
const STEP_DAYS = 90;
const MAX_DAYS = 3650;

export function useGoogleEvents(enabled: boolean) {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(DEFAULT_DAYS);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/google/events?days=${days}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events?: AgendaEvent[] };
      setEvents(data.events ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, days]);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }
    refresh(); // re-runs when `days` changes (refresh depends on it)
  }, [enabled, refresh]);

  const expand = useCallback(
    () => setDays((d) => Math.min(MAX_DAYS, d + STEP_DAYS)),
    []
  );
  const canExpand = days < MAX_DAYS;

  return { events, loading, error, refresh, days, expand, canExpand };
}
