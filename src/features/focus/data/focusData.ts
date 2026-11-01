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
  increment,
  maximum,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import type { HydrationTransport } from "@/lib/hydrationOutbox";
import { logActivity, type ActivityType } from "@/lib/activityLog";
import {
  bookmarkForDay,
  clearBookmarkFocusLink,
  peekBookmarkFocusLink,
} from "@/lib/bookmarkFocusLink";
import {
  type FocusSettings,
  normalizeSettings,
} from "@/features/focus/lib/settings";
import { isMoodKey } from "@/features/focus/lib/mood";
import { isTodoRepeat } from "@/features/focus/lib/recurrence";
import { coerceDreamFields } from "@/features/focus/lib/types";
import type {
  FocusBackup,
  FocusSessionRecord,
  FocusTask,
  JournalEntry,
  JournalNote,
  ScoreRecord,
  Todo,
  TodoList,
} from "@/features/focus/lib/types";

export type { ScoreRecord } from "@/features/focus/lib/types";
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
const scoresCol = (uid: string) => collection(db, "users", uid, "focusScores");
const meditationCol = (uid: string) =>
  collection(db, "users", uid, "meditationSessions");
const resetsCol = (uid: string) =>
  collection(db, "users", uid, "letThemResets");

// ActivityType + logActivity now live in @/lib/activityLog (shared, feature-
// neutral). Re-exported here for focus's own files, which still import the type
// through this module. Habits no longer does: importing a feature-neutral helper
// *through* a feature is what made it look like a habits->focus dependency, so it
// points at @/lib/activityLog directly, the same fix C3 applied to inventory. A
// re-export is a convenience for this feature, not a door into it.
export type { ActivityType };
export { logActivity };

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
  taskId?: string | null,
  intention?: string,
  bookmark?: { id: string; title: string } | null
): Promise<string> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    focusMin,
    day,
    createdAt: serverTimestamp(),
  };
  if (taskId) payload.taskId = taskId;
  if (intention?.trim()) payload.intention = intention.trim();
  if (bookmark?.id) {
    payload.bookmarkId = bookmark.id;
    if (bookmark.title) payload.bookmarkTitle = bookmark.title;
  }
  await setDoc(doc(sessionsCol(uid), id), payload);
  return id;
}

/**
 * Record a completed focus block, attributing it to the bookmark it was launched
 * from (if any) and logging that to the activity timeline. One-shot: the link is
 * cleared so later blocks the same day aren't over-attributed. (Bookmarks →
 * focus → record of progress; the focus side only touches a neutral lib.)
 */
export async function recordFocusSession(
  emailHint: string,
  focusMin: number,
  day: string,
  taskId: string | null,
  intention?: string
): Promise<string> {
  const bookmark = bookmarkForDay(peekBookmarkFocusLink(), day);
  if (bookmark) clearBookmarkFocusLink();
  const id = await logSession(emailHint, focusMin, day, taskId, intention, bookmark);
  if (bookmark) {
    await logActivity(
      emailHint,
      "bookmark",
      `Focused on “${bookmark.title}”`,
      day
    ).catch(() => {});
  }
  return id;
}

/** Attach/replace a session's intention or reflection note (merge-written). */
export async function updateSessionMeta(
  emailHint: string,
  id: string,
  patch: { intention?: string; reflection?: string }
): Promise<void> {
  const uid = await uidFor(emailHint);
  const fields: Record<string, unknown> = {};
  if (patch.intention !== undefined) fields.intention = patch.intention.trim();
  if (patch.reflection !== undefined) fields.reflection = patch.reflection.trim();
  if (Object.keys(fields).length === 0) return;
  await setDoc(doc(sessionsCol(uid), id), fields, { merge: true });
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
      ...(typeof data.intention === "string" ? { intention: data.intention } : {}),
      ...(typeof data.reflection === "string" ? { reflection: data.reflection } : {}),
      ...(typeof data.bookmarkId === "string" ? { bookmarkId: data.bookmarkId } : {}),
      ...(typeof data.bookmarkTitle === "string" ? { bookmarkTitle: data.bookmarkTitle } : {}),
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
  if (record.intention?.trim()) payload.intention = record.intention.trim();
  if (record.reflection?.trim()) payload.reflection = record.reflection.trim();
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
        ...(typeof data.subject === "string" ? { subject: data.subject } : {}),
        createdAt: timestampToIso(data.createdAt),
        kind: data.kind === "dream" ? "dream" : "note",
        ...coerceDreamFields(data),
      } satisfies JournalNote;
    })
    .filter((n) => n.text.trim().length > 0);
}

export async function addNote(
  emailHint: string,
  note: JournalNote
): Promise<void> {
  const uid = await uidFor(emailHint);
  // Only persist structured dream fields when meaningful (Firestore rejects undefined).
  const details = coerceDreamFields(note);
  await setDoc(doc(notesCol(uid), note.id), {
    day: note.day,
    text: note.text,
    ...(note.subject?.trim() ? { subject: note.subject.trim() } : {}),
    createdAt: note.createdAt ?? serverTimestamp(),
    kind: note.kind ?? "note",
    ...details,
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

/**
 * Cups drunk on a given day, or null if no record exists yet. Undefined while
 * this page has a change to the day unacknowledged: the SDK's answer is then
 * stale, for the reason subscribeHydration gives.
 */
export async function fetchHydration(
  emailHint: string,
  day: string
): Promise<number | null | undefined> {
  const uid = await uidFor(emailHint);
  const snap = await getDoc(doc(hydrationCol(uid), day));
  if (snap.metadata.hasPendingWrites) return undefined;
  if (!snap.exists()) return null;
  const cups = snap.data().cups;
  return typeof cups === "number" ? Math.max(0, cups) : null;
}

/**
 * Write a day's count outright. Only a backup restore does this: it replaces
 * whatever other devices have logged, so routine changes go through
 * addHydration.
 */
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

/**
 * Add `delta` cups (a change: +1 or −1 from Focus, any count from a habit tap)
 * to a day's count, with change `opId`'s receipt
 * in the same atomic write (see @/lib/hydrationOutbox). An increment composes
 * with other devices' changes instead of replacing them. A removal is clamped
 * at 0 in the same write, so one that reaches an empty record doesn't leave a
 * debt that eats the next cup.
 */
export async function addHydration(
  emailHint: string,
  day: string,
  delta: number,
  opId: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  const ref = doc(hydrationCol(uid), day);
  const batch = writeBatch(db);
  batch.set(
    ref,
    { cups: increment(delta), updatedAt: serverTimestamp(), ops: { [opId]: delta } },
    { merge: true }
  );
  if (delta < 0) batch.set(ref, { cups: maximum(0) }, { merge: true });
  await batch.commit();
}

/**
 * Deliver a change found in the outbox: in one transaction, read the day from
 * the server and apply the change only if its receipt isn't there yet. Not a
 * read and then a write: a plain read can be answered by an open listener's
 * view, which can lag the very write whose receipt it is looking for, and a
 * write landing between the two would be counted twice anyway. Fails offline.
 */
export async function recoverHydration(
  emailHint: string,
  day: string,
  delta: number,
  opId: string
): Promise<void> {
  const uid = await uidFor(emailHint);
  const ref = doc(hydrationCol(uid), day);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const ops: unknown = data.ops;
    if (ops && typeof ops === "object" && opId in ops) return;
    const cups = typeof data.cups === "number" ? data.cups : 0;
    tx.set(
      ref,
      { cups: Math.max(0, cups + delta), updatedAt: serverTimestamp(), ops: { [opId]: delta } },
      { merge: true }
    );
  });
}

export const hydrationTransport: HydrationTransport = {
  send: addHydration,
  recover: recoverHydration,
};

/* ------------------------------------------------------------- activity --- */

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

/* ----------------------------------------------------------- quiz scores --- */

export async function logScore(
  emailHint: string,
  rec: Omit<ScoreRecord, "id" | "createdAt">
): Promise<void> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  await setDoc(doc(scoresCol(uid), id), {
    topic: rec.topic,
    level: rec.level,
    correct: rec.correct,
    points: rec.points,
    question: rec.question,
    day: rec.day,
    createdAt: serverTimestamp(),
  });
}

export async function deleteScore(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(scoresCol(uid), id));
}

/* ------------------------------------------------------------ import ----- */

/** Write a score at a known id (import/restore) — id-preserving, idempotent. */
async function putScore(emailHint: string, r: ScoreRecord): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(scoresCol(uid), r.id),
    {
      topic: r.topic,
      level: r.level,
      correct: r.correct,
      points: r.points,
      question: r.question,
      day: r.day,
      createdAt: r.createdAt ?? serverTimestamp(),
    },
    { merge: true }
  );
}

/** Write a session at a known id (import/restore) — id-preserving, idempotent. */
async function putSession(
  emailHint: string,
  s: FocusSessionRecord
): Promise<void> {
  const uid = await uidFor(emailHint);
  const payload: Record<string, unknown> = {
    focusMin: s.focusMin,
    day: s.day,
    createdAt: s.createdAt ?? serverTimestamp(),
  };
  if (s.taskId) payload.taskId = s.taskId;
  if (s.intention?.trim()) payload.intention = s.intention.trim();
  if (s.reflection?.trim()) payload.reflection = s.reflection.trim();
  if (s.bookmarkId) {
    payload.bookmarkId = s.bookmarkId;
    if (s.bookmarkTitle) payload.bookmarkTitle = s.bookmarkTitle;
  }
  await setDoc(doc(sessionsCol(uid), s.id), payload, { merge: true });
}

/**
 * Restore a focus JSON backup into the user's cloud data. Every write is
 * id-preserving, so re-importing the same file is idempotent (no duplicates).
 * Best-effort: one failed write doesn't abort the rest.
 */
export async function restoreFocusBackup(
  emailHint: string,
  b: FocusBackup
): Promise<void> {
  await Promise.allSettled([
    ...b.tasks.map((t) => saveTask(emailHint, t)),
    ...b.sessions.map((s) => putSession(emailHint, s)),
    ...b.notes.map((n) => addNote(emailHint, n)),
    ...b.moods.map((m) => saveMood(emailHint, m.day, m.mood)),
    ...b.hydration.map((h) => saveHydration(emailHint, h.day, h.cups)),
    ...b.todos.map((t) => saveTodo(emailHint, t)),
    ...b.scores.map((s) => putScore(emailHint, s)),
  ]);
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
              ...(typeof data.intention === "string" ? { intention: data.intention } : {}),
              ...(typeof data.reflection === "string" ? { reflection: data.reflection } : {}),
              ...(typeof data.bookmarkId === "string" ? { bookmarkId: data.bookmarkId } : {}),
              ...(typeof data.bookmarkTitle === "string" ? { bookmarkTitle: data.bookmarkTitle } : {}),
            };
          })
        ),
      onListenError("sessions")
    )
  );
}

export type MeditationKind = "breath" | "sit" | "guide";

export type MeditationSessionRecord = {
  id: string;
  minutes: number;
  kind: MeditationKind;
  pattern: string | null; // breathing pattern id, when kind === "breath"
  day: string; // YYYY-MM-DD
  createdAt: string | null;
};

/** Persist a completed meditation session. */
export async function logMeditationSession(
  emailHint: string,
  minutes: number,
  day: string,
  kind: MeditationKind,
  pattern?: string | null
): Promise<string> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    minutes,
    kind,
    day,
    createdAt: serverTimestamp(),
  };
  if (pattern) payload.pattern = pattern;
  await setDoc(doc(meditationCol(uid), id), payload);
  return id;
}

export function subscribeMeditationSessions(
  emailHint: string,
  cb: (sessions: MeditationSessionRecord[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      meditationCol(uid),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              minutes: typeof data.minutes === "number" ? data.minutes : 0,
              kind:
                data.kind === "sit" || data.kind === "guide"
                  ? data.kind
                  : "breath",
              pattern: typeof data.pattern === "string" ? data.pattern : null,
              day: typeof data.day === "string" ? data.day : "",
              createdAt: timestampToIso(data.createdAt),
            };
          })
        ),
      onListenError("meditationSessions")
    )
  );
}

/* ----------------------------------------------------- let-them resets --- */
//
// users/{uid}/letThemResets/{id} — one doc per "Let them" reset the user
// completes. Drives the Reset history + streak, the unified activity timeline,
// and (via trackableSources) an optional daily habit.

export type ResetRecord = {
  id: string;
  trigger: string; // what was pulling at them
  action: string; // the "let me" next move
  day: string; // YYYY-MM-DD
  createdAt: string | null;
};

/** Persist a completed reset. Returns the new doc id. */
export async function logReset(
  emailHint: string,
  rec: { trigger: string; action: string; day: string }
): Promise<string> {
  const uid = await uidFor(emailHint);
  const id = crypto.randomUUID();
  await setDoc(doc(resetsCol(uid), id), {
    trigger: rec.trigger,
    action: rec.action,
    day: rec.day,
    createdAt: serverTimestamp(),
  });
  return id;
}

export function subscribeResets(
  emailHint: string,
  cb: (resets: ResetRecord[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      resetsCol(uid),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              trigger: typeof data.trigger === "string" ? data.trigger : "",
              action: typeof data.action === "string" ? data.action : "",
              day: typeof data.day === "string" ? data.day : "",
              createdAt: timestampToIso(data.createdAt),
            };
          })
        ),
      onListenError("letThemResets")
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
                ...(typeof data.subject === "string"
                  ? { subject: data.subject }
                  : {}),
                createdAt: timestampToIso(data.createdAt),
                kind: data.kind === "dream" ? "dream" : "note",
                ...coerceDreamFields(data),
              } satisfies JournalNote;
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

export function subscribeScores(
  emailHint: string,
  cb: (scores: ScoreRecord[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      scoresCol(uid),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              topic: typeof data.topic === "string" ? data.topic : "general",
              level: typeof data.level === "string" ? data.level : "Easy",
              correct: Boolean(data.correct),
              points: typeof data.points === "number" ? data.points : 0,
              question: typeof data.question === "string" ? data.question : "",
              day: typeof data.day === "string" ? data.day : "",
              createdAt: timestampToIso(data.createdAt),
            };
          })
        ),
      onListenError("scores")
    )
  );
}

/**
 * One day's cup count, live.
 *
 * `serverFirst` holds every snapshot back until one comes from the server.
 * Offline, Firestore answers a listener at once from this device's cache, where
 * a record another device wrote reads as missing — and merging against that
 * "missing" queued a write that, on reconnect, replaced the other device's
 * count. Metadata changes are listened for so the server's confirmation still
 * arrives when the data itself hasn't changed.
 *
 * It also holds back every snapshot carrying this page's unacknowledged
 * writes. The SDK lays an increment over the count it had cached when the
 * write was made, not over the server's, so until the write is acknowledged
 * that count is stale: against the emulator, a cup taken before the day was
 * ever read showed as the day's only cup, and one taken offline hid the
 * phone's cups until the acknowledgement came back. The caller shows its own
 * changes itself.
 */
export function subscribeHydration(
  emailHint: string,
  day: string,
  cb: (cups: number | null) => void,
  { serverFirst = false }: { serverFirst?: boolean } = {}
): Unsub {
  return listen(emailHint, (uid) => {
    let confirmed = !serverFirst;
    return onSnapshot(
      doc(hydrationCol(uid), day),
      { includeMetadataChanges: serverFirst },
      (snap) => {
        if (!confirmed) {
          if (snap.metadata.fromCache) return;
          confirmed = true;
        }
        if (serverFirst && snap.metadata.hasPendingWrites) return;
        const cups = snap.exists() ? snap.data().cups : null;
        cb(typeof cups === "number" ? Math.max(0, cups) : null); // a pre-clamp record can be < 0
      },
      onListenError("hydration")
    );
  });
}

/**
 * Live full hydration history — every day's cup total, for the history chart.
 * A snapshot carrying this page's unacknowledged writes is held back, for the
 * reason subscribeHydration gives; metadata changes are listened for so the
 * acknowledgement arrives even when the count it confirms hasn't changed.
 */
export function subscribeHydrationHistory(
  emailHint: string,
  cb: (rows: { day: string; cups: number }[]) => void
): Unsub {
  return listen(emailHint, (uid) =>
    onSnapshot(
      hydrationCol(uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        cb(
          snap.docs
            .map((d) => ({
              day: d.id,
              cups: typeof d.data().cups === "number" ? d.data().cups : 0,
            }))
            .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && r.cups > 0)
        );
      },
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
    completedAt: timestampToIso(data.completedAt),
    day: typeof data.day === "string" ? data.day : "",
    list: (data.list === "project" ? "project" : "personal") as TodoList,
    project: typeof data.project === "string" ? data.project : "",
    googleTaskId:
      typeof data.googleTaskId === "string" ? data.googleTaskId : null,
    googleEventId:
      typeof data.googleEventId === "string" ? data.googleEventId : null,
    ...(isTodoRepeat(data.repeat) ? { repeat: data.repeat } : {}),
    ...(data.priority === "high" || data.priority === "low" ? { priority: data.priority } : {}),
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
      completedAt: todo.completedAt ?? null,
      day: todo.day,
      list: todo.list ?? "personal",
      project: todo.project ?? "",
      googleTaskId: todo.googleTaskId ?? null,
      googleEventId: todo.googleEventId ?? null,
      // null, not omitted: merge:true would otherwise keep a removed repeat/priority.
      repeat: todo.repeat ?? null,
      priority: todo.priority ?? null,
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
