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
} from "@/features/focus/lib/types";

const tasksCol = (uid: string) => collection(db, "users", uid, "focusTasks");
const sessionsCol = (uid: string) =>
  collection(db, "users", uid, "focusSessions");
const settingsDoc = (uid: string) =>
  doc(db, "users", uid, "focusSettings", "settings");
const journalCol = (uid: string) =>
  collection(db, "users", uid, "focusJournal");

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
    return {
      focusMin: typeof data.focusMin === "number" ? data.focusMin : 0,
      day: typeof data.day === "string" ? data.day : "",
      taskId: typeof data.taskId === "string" ? data.taskId : null,
    };
  });
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

export async function saveJournal(
  emailHint: string,
  entry: JournalEntry
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(journalCol(uid), entry.day), {
    note: entry.note,
    mood: entry.mood,
    updatedAt: serverTimestamp(),
  });
}
