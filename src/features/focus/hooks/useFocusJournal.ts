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
} from "@/features/focus/data/focusData";
import { isMoodKey, MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";
import {
  durableDelete,
  durableSave,
  flushPendingDeletes,
  pendingDeleteIds,
  pendingUpsertIds,
  queueDelete,
  queueUpsert,
  replayUpserts,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import {
  coerceDreamFields,
  type DreamDetails,
  type JournalEntry,
  type JournalNote,
  type JournalNoteKind,
} from "@/features/focus/lib/types";
import { todayKey } from "@/lib/dayKey";

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
        ...(typeof n.subject === "string" ? { subject: n.subject } : {}),
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

// The offline queue for journal notes. It used to be "notes", which is the Notes
// pillar's: same account, same key, so each pillar's connect cleared the other's
// queued edits and sent its queued deletes to the wrong collection.
const NOTES_DOMAIN = "focusNotes";
const SHARED_DOMAIN = "notes";
// A day's legacy single note (on its focusJournal/{day} doc), keyed by day. It
// used to be written straight to the cloud and never queued, even signed out.
const LEGACY_DOMAIN = "journalNotes";

/**
 * Once per account, take back the journal's entries from the shared queue. An edit
 * is ours if the note is in our cache. A queued delete can't be told apart (both
 * pillars use random UUIDs, and the note is gone), so it is copied: sent to a
 * collection that doesn't hold the id, a delete does nothing.
 */
function adoptSharedQueue(email: string | null | undefined, ownIds: Set<string>) {
  const flag = `bookmarkdeck:pending-adopted:${NOTES_DOMAIN}:${email ?? ""}`;
  try {
    if (window.localStorage.getItem(flag)) return;
  } catch {
    return;
  }
  for (const id of pendingUpsertIds(SHARED_DOMAIN, email)) {
    if (!ownIds.has(id)) continue;
    queueUpsert(NOTES_DOMAIN, email, id);
    unqueueUpsert(SHARED_DOMAIN, email, id);
  }
  for (const id of pendingDeleteIds(SHARED_DOMAIN, email)) queueDelete(NOTES_DOMAIN, email, id);
  try {
    window.localStorage.setItem(flag, "1");
  } catch {}
}

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
    const cached = loadNotes(email);
    adoptSharedQueue(email, new Set(cached.map((n) => n.id)));
    setEntries(loadEntries(email));
    setNotes(cached);
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
      await flushPendingDeletes(NOTES_DOMAIN, email, (id) => deleteNoteRemote(email, id));
      // Push ONLY what changed while offline — never blindly re-upload the whole
      // local cache (that clobbers newer cloud edits and resurrects notes deleted
      // on another device).
      // Each is sent from the DEVICE cache (another tab may have edited it since
      // this one loaded) and leaves the queue once it lands; one that failed is
      // tried again next connect.
      const noteUps = pendingUpsertIds(NOTES_DOMAIN, email);
      await replayUpserts(NOTES_DOMAIN, email, loadNotes(email).filter((n) => noteUps.has(n.id)), (n) =>
        addNoteRemote(email, n)
      );
      const days = loadEntries(email).map((e) => ({ ...e, id: e.day }));
      const moodUps = pendingUpsertIds("moods", email);
      await replayUpserts("moods", email, days.filter((e) => moodUps.has(e.id)), (e) => saveMood(email, e.day, e.mood));
      const legacyUps = pendingUpsertIds(LEGACY_DOMAIN, email);
      await replayUpserts(LEGACY_DOMAIN, email, days.filter((e) => legacyUps.has(e.id)), (e) =>
        setJournalNote(email, e.day, e.note)
      );
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
      durableSave("moods", email, day, canSync && email ? () => saveMood(email, day, mood) : null).catch(() => {});
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
      details?: DreamDetails,
      subject?: string
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const note: JournalNote = {
        id: crypto.randomUUID(),
        day,
        text: trimmed,
        ...(subject?.trim() ? { subject: subject.trim() } : {}),
        createdAt: new Date().toISOString(),
        kind,
        // Structured attributes only apply to dreams.
        ...(kind === "dream" ? coerceDreamFields(details) : {}),
      };
      setNotes((prev) => [note, ...prev]);
      durableSave(NOTES_DOMAIN, email, note.id, canSync && email ? () => addNoteRemote(email, note) : null).catch(
        () => {}
      );
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
    (id: string, text: string, subject?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (id.startsWith(LEGACY_PREFIX)) {
        const day = id.slice(LEGACY_PREFIX.length);
        setEntries((prev) =>
          prev.map((e) => (e.day === day ? { ...e, note: trimmed } : e))
        );
        durableSave(LEGACY_DOMAIN, email, day, canSync && email ? () => setJournalNote(email, day, trimmed) : null).catch(
          () => {}
        );
        return;
      }
      const cleanSubject = subject?.trim();
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === id
            ? { ...n, text: trimmed, subject: cleanSubject || undefined }
            : n
        );
        const updated = next.find((n) => n.id === id);
        if (updated)
          durableSave(NOTES_DOMAIN, email, id, canSync && email ? () => addNoteRemote(email, updated) : null).catch(
            () => {}
          );
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
        durableSave(LEGACY_DOMAIN, email, day, canSync && email ? () => setJournalNote(email, day, "") : null).catch(
          () => {}
        );
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      // Queued until it lands; this also drops a queued edit, which must not be pushed back.
      durableDelete(NOTES_DOMAIN, email, id, canSync && email ? () => deleteNoteRemote(email, id) : null).catch(
        () => {}
      );
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
        durableSave(LEGACY_DOMAIN, email, day, canSync && email ? () => setJournalNote(email, day, note.text) : null).catch(
          () => {}
        );
        return;
      }
      setNotes((prev) =>
        prev.some((n) => n.id === note.id) ? prev : [note, ...prev]
      );
      durableSave(NOTES_DOMAIN, email, note.id, canSync && email ? () => addNoteRemote(email, note) : null).catch(
        () => {}
      );
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
