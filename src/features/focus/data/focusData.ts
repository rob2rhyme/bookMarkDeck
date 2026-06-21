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
  onSnapshot,
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
  Todo,
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
const todosCol = (uid: string) => collection(db, "users", uid, "todos");
const contentDoc = (uid: string) =>
  doc(db, "users", uid, "focusContent", "content");

export type ActivityType =
  | "focus"
  | "task_added"
  | "task_done"
  | "mood"
  | "journal"
  | "hydration"
  | "todo_added"
  | "todo_done";

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

/** Set (or clear, with "") a migrated legacy single-note on a day doc. Merge so
 *  the day's mood is preserved. */
export async function setJournalNote(
  emailHint: string,
  day: string,
  text: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(doc(journalCol(uid), day), { note: text }, { merge: true });
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

/* --------------------------------------------------- realtime listeners --- */
//
// Each subscribe* attaches an onSnapshot listener and returns an unsubscribe.
// uid resolution is async, so the returned function also cancels a pending
// resolve. Listeners are best-effort (the UI keeps its last-known state on
// error), but failures are logged rather than swallowed so they're diagnosable.

type Unsub = () => void;

/** Shared onSnapshot error handler — logs the failing listener for diagnosis. */
function onListenError(label: string) {
  return (err: unknown) => {
    console.error(`[focus] ${label} listener error:`, err);
  };
}

function listen(
  emailHint: string,
  attach: (uid: string) => Unsub
): Unsub {
  let unsub: Unsub = () => {};
  let cancelled = false;
  uidFor(emailHint)
    .then((uid) => {
      if (!cancelled) unsub = attach(uid);
    })
    .catch((err) => {
      console.error("[focus] listener auth failed:", err);
    });
  return () => {
    cancelled = true;
    unsub();
  };
}

export function subscribeTasks(
  emailHint: string,
  cb: (tasks: FocusTask[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      tasksCol(uid),
      (snap) =>
        cb(
          snap.docs
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
            .filter((t) => t.text.trim().length > 0)
        ),
      onListenError("tasks")
    )
  );
}

export function subscribeSessions(
  emailHint: string,
  cb: (sessions: FocusSessionRecord[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      sessionsCol(uid),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              focusMin: typeof data.focusMin === "number" ? data.focusMin : 0,
              day: typeof data.day === "string" ? data.day : "",
              taskId: typeof data.taskId === "string" ? data.taskId : null,
              createdAt: timestampToIso(data.createdAt),
            };
          })
        ),
      onListenError("sessions")
    )
  );
}

export function subscribeJournal(
  emailHint: string,
  cb: (entries: JournalEntry[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      journalCol(uid),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              day: d.id,
              note: typeof data.note === "string" ? data.note : "",
              mood: isMoodKey(data.mood) ? data.mood : null,
            };
          })
        ),
      onListenError("journal")
    )
  );
}

export function subscribeNotes(
  emailHint: string,
  cb: (notes: JournalNote[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      notesCol(uid),
      (snap) =>
        cb(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                day: typeof data.day === "string" ? data.day : "",
                text: typeof data.text === "string" ? data.text : "",
                createdAt: timestampToIso(data.createdAt),
              };
            })
            .filter((n) => n.text.trim().length > 0)
        ),
      onListenError("notes")
    )
  );
}

export function subscribeActivity(
  emailHint: string,
  cb: (events: ActivityEvent[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      activityCol(uid),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: (typeof data.type === "string"
                ? data.type
                : "focus") as ActivityType,
              summary: typeof data.summary === "string" ? data.summary : "",
              day: typeof data.day === "string" ? data.day : "",
              createdAt: timestampToIso(data.createdAt),
            };
          })
        ),
      onListenError("activity")
    )
  );
}

export function subscribeHydration(
  emailHint: string,
  day: string,
  cb: (cups: number | null) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      doc(hydrationCol(uid), day),
      (snap) => {
        const cups = snap.exists() ? snap.data().cups : null;
        cb(typeof cups === "number" ? cups : null);
      },
      onListenError("hydration")
    )
  );
}

/** Live full hydration history — every day's cup total, for the history chart. */
export function subscribeHydrationHistory(
  emailHint: string,
  cb: (rows: { day: string; cups: number }[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      hydrationCol(uid),
      (snap) =>
        cb(
          snap.docs
            .map((d) => ({
              day: d.id,
              cups: typeof d.data().cups === "number" ? d.data().cups : 0,
            }))
            .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && r.cups > 0)
        ),
      onListenError("hydrationHistory")
    )
  );
}

/* ----------------------------------------------------------------- todos --- */
//
// users/{uid}/todos/{id} — checklist items with an optional due date. Incomplete
// items persist (roll over) across days; `day` marks the day they were created.

function mapTodo(d: { id: string; data: () => Record<string, unknown> }): Todo {
  const data = d.data();
  return {
    id: d.id,
    text: typeof data.text === "string" ? data.text : "",
    note: typeof data.note === "string" ? data.note : "",
    done: Boolean(data.done),
    dueAt: typeof data.dueAt === "string" ? data.dueAt : null,
    createdAt: timestampToIso(data.createdAt),
    day: typeof data.day === "string" ? data.day : "",
    googleTaskId:
      typeof data.googleTaskId === "string" ? data.googleTaskId : null,
    googleEventId:
      typeof data.googleEventId === "string" ? data.googleEventId : null,
  };
}

export async function fetchTodos(emailHint: string): Promise<Todo[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(todosCol(uid));
  return snap.docs.map(mapTodo).filter((t) => t.text.trim().length > 0);
}

export async function saveTodo(emailHint: string, todo: Todo): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(todosCol(uid), todo.id),
    {
      text: todo.text,
      note: todo.note ?? "",
      done: todo.done,
      dueAt: todo.dueAt ?? null,
      day: todo.day,
      googleTaskId: todo.googleTaskId ?? null,
      googleEventId: todo.googleEventId ?? null,
      createdAt: todo.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteTodo(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(todosCol(uid), id));
}

export function subscribeTodos(
  emailHint: string,
  cb: (todos: Todo[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      todosCol(uid),
      (snap) => cb(snap.docs.map(mapTodo).filter((t) => t.text.trim().length > 0)),
      onListenError("todos")
    )
  );
}

/* ----------------------------------------------------------------- content --- */
//
// users/{uid}/focusContent/content — optional per-user EXTRA inspirational
// content (quotes/nuggets/challenges) merged on top of the built-in defaults.
// Raw arrays are passed through; validation/merge happens in the hook.

export type RawContent = {
  quotes: unknown[];
  nuggets: unknown[];
  challenges: unknown[];
};

export function subscribeContent(
  emailHint: string,
  cb: (extra: RawContent | null) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      contentDoc(uid),
      (snap) => {
        if (!snap.exists()) {
          cb(null);
          return;
        }
        const d = snap.data();
        cb({
          quotes: Array.isArray(d.quotes) ? d.quotes : [],
          nuggets: Array.isArray(d.nuggets) ? d.nuggets : [],
          challenges: Array.isArray(d.challenges) ? d.challenges : [],
        });
      },
      onListenError("content")
    )
  );
}
