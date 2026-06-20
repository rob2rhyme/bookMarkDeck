"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ActivityType,
  addNote as addNoteRemote,
  clearJournalNote,
  deleteNote as deleteNoteRemote,
  fetchJournal,
  fetchNotes,
  saveMood,
  todayKey,
} from "@/features/focus/data/focusData";
import { isMoodKey, MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import type { JournalEntry, JournalNote } from "@/features/focus/lib/types";

type LogActivity = (type: ActivityType, summary: string) => void;

const MOOD_KEY = "bookmarkdeck:focus:journal:v1"; // mood + legacy notes
const NOTES_KEY = "bookmarkdeck:focus:notes:v1";

function moodKeyFor(email?: string | null) {
  return email ? `${MOOD_KEY}:${email}` : MOOD_KEY;
}
function notesKeyFor(email?: string | null) {
  return email ? `${NOTES_KEY}:${email}` : NOTES_KEY;
}

function loadEntries(email?: string | null): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(moodKeyFor(email));
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

function loadNotes(email?: string | null): JournalNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(notesKeyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n) => n && typeof n.id === "string")
      .map((n) => ({
        id: n.id as string,
        day: typeof n.day === "string" ? n.day : "",
        text: typeof n.text === "string" ? n.text : "",
        createdAt: typeof n.createdAt === "string" ? n.createdAt : null,
      }))
      .filter((n) => n.text.trim().length > 0);
  } catch {
    return [];
  }
}

const LEGACY_PREFIX = "legacy-";

/**
 * Per-day mood + multiple timestamped notes per day. Mood lives in
 * focusJournal/{day} (merge-written so notes never clobber it); notes live in
 * the focusNotes collection. Legacy single-notes stored on day docs are
 * surfaced (and deletable) so older data isn't lost.
 */
export function useFocusJournal(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<JournalNote[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);
  const today = todayKey();

  useEffect(() => {
    setEntries(loadEntries(email));
    setNotes(loadNotes(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(moodKeyFor(email), JSON.stringify(entries));
      window.localStorage.setItem(notesKeyFor(email), JSON.stringify(notes));
    } catch {}
  }, [entries, notes, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    Promise.all([fetchJournal(email), fetchNotes(email)])
      .then(([remoteEntries, remoteNotes]) => {
        if (cancelled) return;
        if (remoteEntries.length) setEntries(remoteEntries);
        if (remoteNotes.length) setNotes(remoteNotes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  // Mood (one per day) — merge-written so it never wipes notes.
  const setMood = useCallback(
    (mood: MoodKey | null) => {
      setEntries((prev) => {
        const existing = prev.find((e) => e.day === today);
        const updated: JournalEntry = existing
          ? { ...existing, mood }
          : { day: today, note: "", mood };
        return existing
          ? prev.map((e) => (e.day === today ? updated : e))
          : [...prev, updated];
      });
      if (canSync && email) saveMood(email, today, mood).catch(() => {});
      if (mood) onLog?.("mood", `Felt ${MOOD_BY_KEY[mood].label.toLowerCase()}`);
    },
    [today, canSync, email, onLog]
  );

  const addNote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const note: JournalNote = {
        id: crypto.randomUUID(),
        day: today,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      setNotes((prev) => [note, ...prev]);
      if (canSync && email) addNoteRemote(email, note).catch(() => {});
      onLog?.("journal", "Added a journal note");
    },
    [today, canSync, email, onLog]
  );

  const removeNote = useCallback(
    (id: string) => {
      if (id.startsWith(LEGACY_PREFIX)) {
        const day = id.slice(LEGACY_PREFIX.length);
        setEntries((prev) =>
          prev.map((e) => (e.day === day ? { ...e, note: "" } : e))
        );
        if (canSync && email) clearJournalNote(email, day).catch(() => {});
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (canSync && email) deleteNoteRemote(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const todayMood = useMemo(
    () => entries.find((e) => e.day === today)?.mood ?? null,
    [entries, today]
  );

  const moodByDay = useMemo(() => {
    const map: Record<string, MoodKey> = {};
    for (const e of entries) if (e.mood) map[e.day] = e.mood;
    return map;
  }, [entries]);

  // All notes (collection + migrated legacy day-notes) grouped by day, newest
  // first; notes within a day newest first.
  const notesByDay = useMemo(() => {
    const legacy: JournalNote[] = entries
      .filter((e) => e.note.trim().length > 0)
      .map((e) => ({
        id: `${LEGACY_PREFIX}${e.day}`,
        day: e.day,
        text: e.note,
        createdAt: null,
      }));
    const all = [...notes, ...legacy];
    const byDay = new Map<string, JournalNote[]>();
    for (const n of all) {
      if (!n.day) continue;
      const bucket = byDay.get(n.day);
      if (bucket) bucket.push(n);
      else byDay.set(n.day, [n]);
    }
    const time = (n: JournalNote) =>
      n.createdAt ? new Date(n.createdAt).getTime() : 0;
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, list]) => ({
        day,
        notes: [...list].sort((a, b) => time(b) - time(a)),
      }));
  }, [notes, entries]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const [remoteEntries, remoteNotes] = await Promise.all([
      fetchJournal(email),
      fetchNotes(email),
    ]);
    setEntries(remoteEntries);
    setNotes(remoteNotes);
  }, [canSync, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await Promise.all([
      ...entries
        .filter((e) => e.mood)
        .map((e) => saveMood(email, e.day, e.mood)),
      ...notes.map((n) => addNoteRemote(email, n)),
    ]);
  }, [canSync, email, entries, notes]);

  return {
    hydrated,
    todayMood,
    setMood,
    moodByDay,
    notesByDay,
    addNote,
    removeNote,
    pullFromCloud,
    pushToCloud,
  };
}
