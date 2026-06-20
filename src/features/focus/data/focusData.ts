// src/features/focus/data/focusData.ts
//
// Firestore persistence for the focus feature. Mirrors the existing
// firestoreShortcuts/firestoreBookmarks pattern: authenticate with
// ensureFirebaseGoogleAuth(emailHint), then scope all data under users/{uid}.
//
//   users/{uid}/focusTasks/{taskId}      -> reusable, time-tracked tasks
//   users/{uid}/focusSessions/{id}       -> one doc per completed focus block
//   users/{uid}/focusSettings/settings   -> settings doc
//   users/{uid}/focusJournal/{YYYY-MM-DD} -> daily note + mood

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import {
  type FocusSettings,
  normalizeSettings,
} from "@/features/focus/lib/settings";
import { isMoodKey } from "@/features/focus/lib/mood";
import type {
  FocusSessionRecord,
  FocusTask,
  JournalEntry,
  JournalNote,
} from "@/features/focus/lib/types";
import { type MoodKey } from "@/features/focus/lib/mood";

const tasksCol = (uid: string) => collection(db, "users", uid, "focusTasks");
const sessionsCol = (uid: string) =>
  collection(db, "users", uid, "focusSessions");
const settingsDoc = (uid: string) =>
  doc(db, "users", uid, "focusSettings", "settings");
const journalCol = (uid: string) =>
  collection(db, "users", uid, "focusJournal");
const notesCol = (uid: string) => collection(db, "users", uid, "focusNotes");
const activityCol = (uid: string) => collection(db, "users", uid, "activity");
const hydrationCol = (uid: string) =>
  collection(db, "users", uid, "focusHydration");

export type ActivityType =
  | "focus"
  | "task_added"
  | "task_done"
  | "mood"
  | "journal"
  | "hydration";

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  summary: string;
  day: string;
  createdAt: string | null;
};

function timestampToIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

async function uidFor(emailHint: string): Promise<string> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  return user.uid;
}

/** Local YYYY-MM-DD for "today" — computed client-side, never during render. */
export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------------------------- tasks --- */

export async function fetchTasks(emailHint: string): Promise<FocusTask[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(tasksCol(uid));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        text: typeof data.text === "string" ? data.text : "",
        done: Boolean(data.done),
        lastUsedAt:
          typeof data.lastUsedAt === "string" ? data.lastUsedAt : null,
      };
    })
    .filter((task) => task.text.trim().length > 0);
}

export async function saveTask(
  emailHint: string,
  task: FocusTask
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(tasksCol(uid), task.id),
    {
      text: task.text,
      done: task.done,
      lastUsedAt: task.lastUsedAt ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteTask(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(tasksCol(uid), id));
}

/** Stamp a task as just-used (for "resume last task"). */
export async function touchTask(
  emailHint: string,
  id: string,
  isoTime: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(tasksCol(uid), id), { lastUsedAt: isoTime }, { merge: true });
}

/* ------------------------------------------------------------- sessions --- */

export async function logSession(
  emailHint: string,
  focusMin: number,
  day: string,
  taskId?: string | null
): Promise<void> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    focusMin,
    day,
    createdAt: serverTimestamp(),
  };
  if (taskId) payload.taskId = taskId;
  await setDoc(doc(sessionsCol(uid), id), payload);
}

export async function countSessionsForDay(
  emailHint: string,
  day: string
): Promise<number> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(query(sessionsCol(uid), where("day", "==", day)));
  return snap.size;
}

/** All completed focus sessions for the user — input for the analysis panel. */
export async function fetchSessions(
  emailHint: string
): Promise<FocusSessionRecord[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(sessionsCol(uid));
  return snap.docs.map((d) => {
    const data = d.data();
    const created = data.createdAt as { toDate?: () => Date } | string | null;
    let createdAt: string | null = null;
    if (created && typeof (created as { toDate?: unknown }).toDate === "function") {
      createdAt = (created as { toDate: () => Date }).toDate().toISOString();
    } else if (typeof created === "string") {
      createdAt = created;
    }
    return {
      id: d.id,
      focusMin: typeof data.focusMin === "number" ? data.focusMin : 0,
      day: typeof data.day === "string" ? data.day : "",
      taskId: typeof data.taskId === "string" ? data.taskId : null,
      createdAt,
    };
  });
}

/** Delete a single focus session (also removes it from analysis + streak). */
export async function deleteSession(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(sessionsCol(uid), id));
}

/** Re-create a previously deleted session, preserving its id and timestamp. */
export async function restoreSession(
  emailHint: string,
  record: FocusSessionRecord
): Promise<void> {
  const uid = await uidFor(emailHint);
  const payload: Record<string, unknown> = {
    focusMin: record.focusMin,
    day: record.day,
    createdAt: record.createdAt ?? serverTimestamp(),
  };
  if (record.taskId) payload.taskId = record.taskId;
  await setDoc(doc(sessionsCol(uid), record.id), payload);
}

/* ------------------------------------------------------------- settings --- */

export async function fetchSettings(
  emailHint: string
): Promise<FocusSettings | null> {
  const uid = await uidFor(emailHint);
  const snap = await getDoc(settingsDoc(uid));
  if (!snap.exists()) return null;
  return normalizeSettings(snap.data());
}

export async function saveSettings(
  emailHint: string,
  settings: FocusSettings
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(settingsDoc(uid), {
    ...settings,
    updatedAt: serverTimestamp(),
  });
}

/* -------------------------------------------------------------- journal --- */

export async function fetchJournal(
  emailHint: string
): Promise<JournalEntry[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(journalCol(uid));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      day: d.id,
      note: typeof data.note === "string" ? data.note : "",
      mood: isMoodKey(data.mood) ? data.mood : null,
    };
  });
}

/** Persist the mood for a day. Merge so it never clobbers the legacy note. */
export async function saveMood(
  emailHint: string,
  day: string,
  mood: MoodKey | null
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(journalCol(uid), day),
    { mood, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Clear a migrated legacy single-note on a day doc (keeps the mood). */
export async function clearJournalNote(
  emailHint: string,
  day: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(journalCol(uid), day), { note: "" }, { merge: true });
}

/* ---------------------------------------------------------------- notes --- */

export async function fetchNotes(emailHint: string): Promise<JournalNote[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(notesCol(uid));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        day: typeof data.day === "string" ? data.day : "",
        text: typeof data.text === "string" ? data.text : "",
        createdAt: timestampToIso(data.createdAt),
      };
    })
    .filter((n) => n.text.trim().length > 0);
}

export async function addNote(
  emailHint: string,
  note: JournalNote
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(notesCol(uid), note.id), {
    day: note.day,
    text: note.text,
    createdAt: note.createdAt ?? serverTimestamp(),
  });
}

export async function deleteNote(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(notesCol(uid), id));
}

/* ------------------------------------------------------------ hydration --- */

/** Cups drunk on a given day, or null if no record exists yet. */
export async function fetchHydration(
  emailHint: string,
  day: string
): Promise<number | null> {
  const uid = await uidFor(emailHint);
  const snap = await getDoc(doc(hydrationCol(uid), day));
  if (!snap.exists()) return null;
  const cups = snap.data().cups;
  return typeof cups === "number" ? cups : null;
}

export async function saveHydration(
  emailHint: string,
  day: string,
  cups: number
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(hydrationCol(uid), day),
    { cups, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ------------------------------------------------------------- activity --- */

export async function logActivity(
  emailHint: string,
  type: ActivityType,
  summary: string,
  day: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  await setDoc(doc(activityCol(uid), id), {
    type,
    summary,
    day,
    createdAt: serverTimestamp(),
  });
}

export async function deleteActivity(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(activityCol(uid), id));
}

/** Re-create a previously deleted activity event, preserving its id. */
export async function restoreActivity(
  emailHint: string,
  event: ActivityEvent
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(activityCol(uid), event.id), {
    type: event.type,
    summary: event.summary,
    day: event.day,
    createdAt: event.createdAt ?? serverTimestamp(),
  });
}

export async function fetchActivity(
  emailHint: string
): Promise<ActivityEvent[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(activityCol(uid));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      type: (typeof data.type === "string" ? data.type : "focus") as ActivityType,
      summary: typeof data.summary === "string" ? data.summary : "",
      day: typeof data.day === "string" ? data.day : "",
      createdAt: timestampToIso(data.createdAt),
    };
  });
}
