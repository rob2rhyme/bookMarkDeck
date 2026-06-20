"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchSessions } from "@/features/focus/data/focusData";
import type { FocusSessionRecord } from "@/features/focus/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DayBucket = { sessions: number; focusMin: number };

/**
 * Derives progress stats from the focus sessions stored in Firestore.
 * Reloads when `refreshKey` changes (bumped after a session is logged).
 */
export function useFocusStats(
  email: string | null | undefined,
  connected: boolean,
  refreshKey: number
) {
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    fetchSessions(email)
      .then((records) => {
        if (!cancelled) {
          setSessions(records);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [canSync, email, refreshKey]);

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

  const last7 = useMemo(() => {
    const out: {
      key: string;
      label: string;
      sessions: number;
      isToday: boolean;
    }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = dayKey(d);
      out.push({
        key: k,
        label: WEEKDAYS[d.getDay()],
        sessions: byDay[k]?.sessions ?? 0,
        isToday: i === 0,
      });
    }
    return out;
  }, [byDay]);

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

  // Last 7 calendar days (inclusive of today) — for the weekly summary.
  const week = useMemo(() => {
    const days = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.add(dayKey(d));
    }
    let sessionsCount = 0;
    let focusMin = 0;
    const taskMin: Record<string, number> = {};
    for (const s of sessions) {
      if (!days.has(s.day)) continue;
      sessionsCount += 1;
      focusMin += s.focusMin;
      if (s.taskId) taskMin[s.taskId] = (taskMin[s.taskId] ?? 0) + s.focusMin;
    }
    return { sessions: sessionsCount, focusMin, taskMin };
  }, [sessions]);

  return {
    available: canSync,
    loaded,
    sessions,
    todaySessions: today.sessions,
    todayFocusMin: today.focusMin,
    last7,
    streak,
    totalSessions: totals.sessions,
    totalFocusMin: totals.focusMin,
    byTask,
    weekSessions: week.sessions,
    weekFocusMin: week.focusMin,
    weekTaskMin: week.taskMin,
  };
}
