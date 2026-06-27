"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteSession,
  restoreSession as restoreSessionRemote,
  subscribeSessions,
} from "@/features/focus/data/focusData";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type DayBucket = { sessions: number; focusMin: number };

/**
 * Derives progress stats from the live focus sessions. Today's progress, the
 * streak, and all-time totals are always current; the 7-day chart + weekly
 * summary shift by `weekOffset` weeks into the past (0 = the current week) so
 * the user can page back through history.
 */
export function useFocusStats(
  email: string | null | undefined,
  connected: boolean,
  weekOffset = 0
) {
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setLoaded(false);
      return;
    }
    // Live updates — new sessions (incl. from other devices) stream in.
    return subscribeSessions(email, (records) => {
      setSessions(records);
      setLoaded(true);
    });
  }, [canSync, email]);

  const removeSession = useCallback(
    (id: string) => {
      if (!canSync || !email) return;
      setSessions((prev) => prev.filter((s) => s.id !== id));
      deleteSession(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const restoreSession = useCallback(
    (record: FocusSessionRecord) => {
      if (!canSync || !email) return;
      setSessions((prev) =>
        prev.some((s) => s.id === record.id) ? prev : [...prev, record]
      );
      restoreSessionRemote(email, record).catch(() => {});
    },
    [canSync, email]
  );

  /** Backfill: add a focus session for any day (date + minutes + optional task). */
  const addSession = useCallback(
    (focusMin: number, day: string, taskId: string | null) => {
      if (!canSync || !email || !day) return;
      const record: FocusSessionRecord = {
        id: crypto.randomUUID(),
        focusMin: Math.max(1, Math.round(focusMin)),
        day,
        taskId: taskId || null,
        createdAt: new Date().toISOString(),
      };
      setSessions((prev) => [...prev, record]);
      restoreSessionRemote(email, record).catch(() => {});
    },
    [canSync, email]
  );

  const byDay = useMemo(() => {
    const map: Record<string, DayBucket> = {};
    for (const s of sessions) {
      if (!s.day) continue;
      const cur = map[s.day] ?? { sessions: 0, focusMin: 0 };
      map[s.day] = {
        sessions: cur.sessions + 1,
        focusMin: cur.focusMin + s.focusMin,
      };
    }
    return map;
  }, [sessions]);

  const today = byDay[dayKey(new Date())] ?? { sessions: 0, focusMin: 0 };

  // Anchor (the "end" day of the visible window), shifted back by whole weeks.
  const anchor = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - weekOffset * 7);
    return d;
  }, [weekOffset]);

  const last7 = useMemo(() => {
    const out: {
      key: string;
      label: string;
      sessions: number;
      isToday: boolean;
    }[] = [];
    const todayK = dayKey(new Date());
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() - i);
      const k = dayKey(d);
      out.push({
        key: k,
        label: WEEKDAYS[d.getDay()],
        sessions: byDay[k]?.sessions ?? 0,
        isToday: k === todayK,
      });
    }
    return out;
  }, [byDay, anchor]);

  const weekLabel = useMemo(() => {
    const end = new Date(anchor);
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - 6);
    return `${shortDate(start)} – ${shortDate(end)}`;
  }, [anchor]);

  const streak = useMemo(() => {
    let count = 0;
    const d = new Date();
    if (!byDay[dayKey(d)]?.sessions) {
      d.setDate(d.getDate() - 1); // today not started — don't break the streak
    }
    while ((byDay[dayKey(d)]?.sessions ?? 0) > 0) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [byDay]);

  const totals = useMemo(() => {
    let s = 0;
    let m = 0;
    for (const rec of sessions) {
      s += 1;
      m += rec.focusMin;
    }
    return { sessions: s, focusMin: m };
  }, [sessions]);

  const byTask = useMemo(() => {
    const map: Record<string, DayBucket> = {};
    for (const s of sessions) {
      if (!s.taskId) continue;
      const cur = map[s.taskId] ?? { sessions: 0, focusMin: 0 };
      map[s.taskId] = {
        sessions: cur.sessions + 1,
        focusMin: cur.focusMin + s.focusMin,
      };
    }
    return map;
  }, [sessions]);

  // Per-resource focus time (bookmark-launched blocks). The title is denormalized
  // onto the session, so this resolves without importing the bookmarks feature.
  const byBookmark = useMemo(() => {
    const map: Record<string, { sessions: number; focusMin: number; title: string }> =
      {};
    for (const s of sessions) {
      if (!s.bookmarkId) continue;
      const cur = map[s.bookmarkId] ?? { sessions: 0, focusMin: 0, title: "" };
      map[s.bookmarkId] = {
        sessions: cur.sessions + 1,
        focusMin: cur.focusMin + s.focusMin,
        title: s.bookmarkTitle || cur.title,
      };
    }
    return map;
  }, [sessions]);

  // The 7-day window ending at the anchor — for the weekly summary.
  const week = useMemo(() => {
    const days = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() - i);
      days.add(dayKey(d));
    }
    let sessionsCount = 0;
    let focusMin = 0;
    const taskMin: Record<string, number> = {};
    const bookmarkMin: Record<string, { focusMin: number; title: string }> = {};
    for (const s of sessions) {
      if (!days.has(s.day)) continue;
      sessionsCount += 1;
      focusMin += s.focusMin;
      if (s.taskId) taskMin[s.taskId] = (taskMin[s.taskId] ?? 0) + s.focusMin;
      if (s.bookmarkId) {
        const cur = bookmarkMin[s.bookmarkId] ?? { focusMin: 0, title: "" };
        bookmarkMin[s.bookmarkId] = {
          focusMin: cur.focusMin + s.focusMin,
          title: s.bookmarkTitle || cur.title,
        };
      }
    }
    return { sessions: sessionsCount, focusMin, taskMin, bookmarkMin };
  }, [sessions, anchor]);

  // The prior 7-day window (days 7–13 before the anchor) — for the week-vs-week
  // delta. Focus minutes only; that's all the comparison needs.
  const prevWeekFocusMin = useMemo(() => {
    const days = new Set<string>();
    for (let i = 7; i < 14; i++) {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() - i);
      days.add(dayKey(d));
    }
    let focusMin = 0;
    for (const s of sessions) {
      if (days.has(s.day)) focusMin += s.focusMin;
    }
    return focusMin;
  }, [sessions, anchor]);

  return {
    available: canSync,
    loaded,
    sessions,
    removeSession,
    restoreSession,
    addSession,
    todaySessions: today.sessions,
    todayFocusMin: today.focusMin,
    last7,
    weekLabel,
    isCurrentWeek: weekOffset === 0,
    streak,
    totalSessions: totals.sessions,
    totalFocusMin: totals.focusMin,
    byTask,
    byBookmark,
    weekSessions: week.sessions,
    weekFocusMin: week.focusMin,
    weekTaskMin: week.taskMin,
    weekBookmarkMin: week.bookmarkMin,
    prevWeekFocusMin,
  };
}
