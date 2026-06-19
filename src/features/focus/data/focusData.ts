// src/features/focus/data/focusData.ts
//
// Firestore persistence for the focus feature. Mirrors the existing
// firestoreShortcuts/firestoreBookmarks pattern: authenticate with
// ensureFirebaseGoogleAuth(emailHint), then scope all data under users/{uid}.
//
// Focus data lives in queryable subcollections (like users/{uid}/bookmarkBackups):
//   users/{uid}/focusTasks/{taskId}      -> current-session tasks
//   users/{uid}/focusSessions/{id}       -> one doc per completed focus block

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import type { SessionTask } from "@/features/focus/hooks/useSessionTasks";

const tasksCol = (uid: string) => collection(db, "users", uid, "focusTasks");
const sessionsCol = (uid: string) =>
  collection(db, "users", uid, "focusSessions");

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

export async function fetchTasks(emailHint: string): Promise<SessionTask[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(tasksCol(uid));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        text: typeof data.text === "string" ? data.text : "",
        done: Boolean(data.done),
      };
    })
    .filter((task) => task.text.trim().length > 0);
}

export async function saveTask(
  emailHint: string,
  task: SessionTask
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(tasksCol(uid), task.id), {
    text: task.text,
    done: task.done,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTask(
  emailHint: string,
  id: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(tasksCol(uid), id));
}

export async function logSession(
  emailHint: string,
  focusMin: number,
  day: string,
  linkedFolderId?: string | null
): Promise<void> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    focusMin,
    day,
    createdAt: serverTimestamp(),
  };
  // Firestore rejects undefined; only include the link when present.
  if (linkedFolderId) payload.linkedFolderId = linkedFolderId;
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
