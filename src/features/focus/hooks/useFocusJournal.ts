"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ActivityType,
  addNote as addNoteRemote,
  deleteNote as deleteNoteRemote,
  fetchJournal,
  fetchNotes,
  saveMood,
  setJournalNote,
  subscribeJournal,
  subscribeNotes,
  todayKey,
} from "@/features/focus/data/focusData";
import { isMoodKey, MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import {
  clearPendingUpserts,
  flushPendingDeletes,
  pendingUpsertIds,
  queueDelete,
  queueUpsert,
  unqueueDelete,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import {
  coerceDreamFields,
  type DreamDetails,
  type JournalEntry,
  type JournalNote,
  type JournalNoteKind,
} from "@/features/focus/lib/types";

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
        kind: n.kind === "dream" ? "dream" : "note",
        ...coerceDreamFields(n),
      } satisfies JournalNote))
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
    // Replay offline note deletions and seed local-only entries to the cloud
    // BEFORE subscribing — otherwise the first live snapshot resurrects deleted
    // notes and drops local-only entries.
    let cancelled = false;
    let unsubJournal = () => {};
    let unsubNotes = () => {};
    (async () => {
      await flushPendingDeletes("notes", email, (id) => deleteNoteRemote(email, id));
      // Push ONLY what changed while offline — never blindly re-upload the whole
      // local cache (that clobbers newer cloud edits and resurrects notes deleted
      // on another device).
      const noteUps = pendingUpsertIds("notes", email);
      if (noteUps.size)
        await Promise.all(
          notes
            .filter((n) => noteUps.has(n.id))
            .map((n) => addNoteRemote(email, n).catch(() => {}))
        );
      const moodUps = pendingUpsertIds("moods", email);
      if (moodUps.size)
        await Promise.all(
          entries
            .filter((e) => moodUps.has(e.day))
            .map((e) => saveMood(email, e.day, e.mood).catch(() => {}))
        );
      clearPendingUpserts("notes", email);
      clearPendingUpserts("moods", email);
    })()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        unsubJournal = subscribeJournal(email, setEntries);
        unsubNotes = subscribeNotes(email, setNotes);
      });
    return () => {
      cancelled = true;
      unsubJournal();
      unsubNotes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  // Mood (one per day) — merge-written so it never wipes notes.
  const setMood = useCallback(
    (mood: MoodKey | null, day: string = today) => {
      setEntries((prev) => {
        const existing = prev.find((e) => e.day === day);
        const updated: JournalEntry = existing
          ? { ...existing, mood }
          : { day, note: "", mood };
        return existing
          ? prev.map((e) => (e.day === day ? updated : e))
          : [...prev, updated];
      });
      if (canSync && email) saveMood(email, day, mood).catch(() => {});
      else queueUpsert("moods", email, day);
      // Activity log is today-scoped; don't log backdated mood as "today".
      if (mood && day === today)
        onLog?.("mood", `Felt ${MOOD_BY_KEY[mood].label.toLowerCase()}`);
    },
    [today, canSync, email, onLog]
  );

  const addNote = useCallback(
    (
      text: string,
      kind: JournalNoteKind = "note",
      day: string = today,
      details?: DreamDetails
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const note: JournalNote = {
        id: crypto.randomUUID(),
        day,
        text: trimmed,
        createdAt: new Date().toISOString(),
        kind,
        // Structured attributes only apply to dreams.
        ...(kind === "dream" ? coerceDreamFields(details) : {}),
      };
      setNotes((prev) => [note, ...prev]);
      if (canSync && email) addNoteRemote(email, note).catch(() => {});
      else queueUpsert("notes", email, note.id);
      // Activity log is today-scoped; don't log backdated entries as "today".
      if (day === today)
        onLog?.(
          kind === "dream" ? "dream" : "journal",
          kind === "dream" ? "Recorded a dream" : "Added a journal note"
        );
    },
    [today, canSync, email, onLog]
  );

  const editNote = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (id.startsWith(LEGACY_PREFIX)) {
        const day = id.slice(LEGACY_PREFIX.length);
        setEntries((prev) =>
          prev.map((e) => (e.day === day ? { ...e, note: trimmed } : e))
        );
        if (canSync && email) setJournalNote(email, day, trimmed).catch(() => {});
        return;
      }
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === id ? { ...n, text: trimmed } : n
        );
        const updated = next.find((n) => n.id === id);
        if (canSync && email && updated)
          addNoteRemote(email, updated).catch(() => {});
        else if (updated) queueUpsert("notes", email, id);
        return next;
      });
    },
    [canSync, email]
  );

  const removeNote = useCallback(
    (id: string) => {
      if (id.startsWith(LEGACY_PREFIX)) {
        const day = id.slice(LEGACY_PREFIX.length);
        setEntries((prev) =>
          prev.map((e) => (e.day === day ? { ...e, note: "" } : e))
        );
        if (canSync && email) setJournalNote(email, day, "").catch(() => {});
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (canSync && email) deleteNoteRemote(email, id).catch(() => {});
      // Not connected → remember to delete from the cloud on next connect, and
      // drop any pending offline upsert so the flush won't re-create it.
      else {
        queueDelete("notes", email, id);
        unqueueUpsert("notes", email, id);
      }
    },
    [canSync, email]
  );

  const restoreNote = useCallback(
    (note: JournalNote) => {
      if (note.id.startsWith(LEGACY_PREFIX)) {
        const day = note.id.slice(LEGACY_PREFIX.length);
        setEntries((prev) =>
          prev.map((e) => (e.day === day ? { ...e, note: note.text } : e))
        );
        if (canSync && email) setJournalNote(email, day, note.text).catch(() => {});
        return;
      }
      unqueueDelete("notes", email, note.id); // un-delete if it was queued
      setNotes((prev) =>
        prev.some((n) => n.id === note.id) ? prev : [note, ...prev]
      );
      if (canSync && email) addNoteRemote(email, note).catch(() => {});
      else queueUpsert("notes", email, note.id);
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
    editNote,
    removeNote,
    restoreNote,
    pullFromCloud,
    pushToCloud,
  };
}
