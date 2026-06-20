"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ActivityType,
  fetchJournal,
  saveJournal,
  todayKey,
} from "@/features/focus/data/focusData";
import { isMoodKey, MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import type { JournalEntry } from "@/features/focus/lib/types";

type LogActivity = (type: ActivityType, summary: string) => void;

const BASE_KEY = "bookmarkdeck:focus:journal:v1";

function keyFor(email?: string | null) {
  return email ? `${BASE_KEY}:${email}` : BASE_KEY;
}

function loadLocal(email?: string | null): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.day === "string")
      .map((e) => ({
        day: e.day as string,
        note: typeof e.note === "string" ? e.note : "",
        mood: isMoodKey(e.mood) ? e.mood : null,
      }));
  } catch {
    return [];
  }
}

/**
 * Per-day journal: one note + mood per calendar day. localStorage + Firestore.
 */
export function useFocusJournal(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);
  const today = todayKey();

  useEffect(() => {
    setEntries(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(entries));
    } catch {}
  }, [entries, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    fetchJournal(email)
      .then((remote) => {
        if (!cancelled && remote.length) setEntries(remote);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (entry: JournalEntry, debounce: boolean) => {
      if (!canSync || !email) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      const run = () => saveJournal(email, entry).catch(() => {});
      if (debounce) writeTimer.current = setTimeout(run, 700);
      else run();
    },
    [canSync, email]
  );

  const upsert = useCallback(
    (patch: Partial<Pick<JournalEntry, "note" | "mood">>, debounce: boolean) => {
      setEntries((prev) => {
        const existing = prev.find((e) => e.day === today) ?? {
          day: today,
          note: "",
          mood: null,
        };
        const updated: JournalEntry = { ...existing, ...patch };
        persist(updated, debounce);
        const has = prev.some((e) => e.day === today);
        return has
          ? prev.map((e) => (e.day === today ? updated : e))
          : [...prev, updated];
      });
    },
    [today, persist]
  );

  const setNote = useCallback((note: string) => upsert({ note }, true), [upsert]);
  const setMood = useCallback(
    (mood: MoodKey | null) => {
      upsert({ mood }, false);
      if (mood) onLog?.("mood", `Felt ${MOOD_BY_KEY[mood].label.toLowerCase()}`);
    },
    [upsert, onLog]
  );

  const todayEntry = useMemo(
    () => entries.find((e) => e.day === today) ?? { day: today, note: "", mood: null },
    [entries, today]
  );

  const moodByDay = useMemo(() => {
    const map: Record<string, MoodKey> = {};
    for (const e of entries) if (e.mood) map[e.day] = e.mood;
    return map;
  }, [entries]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const remote = await fetchJournal(email);
    setEntries(remote);
  }, [canSync, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await Promise.all(entries.map((e) => saveJournal(email, e)));
  }, [canSync, email, entries]);

  return {
    hydrated,
    todayNote: todayEntry.note,
    todayMood: todayEntry.mood,
    setNote,
    setMood,
    moodByDay,
    pullFromCloud,
    pushToCloud,
  };
}
