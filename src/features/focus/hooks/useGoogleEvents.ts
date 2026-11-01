"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgendaEvent } from "@/app/api/google/events/route";

export type { AgendaEvent };

/** What the Agenda's add form hands over; `start` is a bare day (all-day) or an ISO instant. */
export type NewEvent = { title: string; start: string; durationMin?: number };

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

  // Write-back: create on / delete from the primary calendar, then re-read so
  // the agenda shows what Google actually holds rather than a guess.
  const create = useCallback(
    async (event: NewEvent): Promise<boolean> => {
      if (!enabled) return false;
      try {
        const res = await fetch("/api/google/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });
        if (!res.ok) return false;
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    [enabled, refresh]
  );

  const remove = useCallback(
    async (event: AgendaEvent): Promise<boolean> => {
      if (!enabled) return false;
      try {
        const res = await fetch(`/api/google/events?id=${encodeURIComponent(event.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) return false;
        // Drop it at once; the refresh confirms.
        setEvents((prev) => prev.filter((e) => !(e.id === event.id && e.calendarId === event.calendarId)));
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    [enabled, refresh]
  );

  const expand = useCallback(
    () => setDays((d) => Math.min(MAX_DAYS, d + STEP_DAYS)),
    []
  );
  const collapse = useCallback(
    () => setDays((d) => Math.max(DEFAULT_DAYS, d - STEP_DAYS)),
    []
  );
  const canExpand = days < MAX_DAYS;
  const canCollapse = days > DEFAULT_DAYS;

  return {
    events,
    loading,
    error,
    refresh,
    create,
    remove,
    days,
    expand,
    collapse,
    canExpand,
    canCollapse,
  };
}
