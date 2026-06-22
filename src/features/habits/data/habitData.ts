// src/features/habits/data/habitData.ts
//
// Firestore persistence for the habits feature. Mirrors focusData.ts: sign in
// with ensureFirebaseGoogleAuth(emailHint), then scope everything under
// users/{uid}. Covered by the existing recursive owner rule — no new rule.
//
//   users/{uid}/habits/{habitId}                    -> habit definitions
//   users/{uid}/habitEntries/{habitId}_{YYYY-MM-DD} -> per-day logs (idempotent)

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { addDays, todayKey } from "@/features/habits/lib/day";
import {
  coerceEntry,
  coerceHabit,
  habitToDoc,
} from "@/features/habits/lib/serialize";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

const habitsCol = (uid: string) => collection(db, "users", uid, "habits");
const entriesCol = (uid: string) => collection(db, "users", uid, "habitEntries");

async function uidFor(emailHint: string): Promise<string> {
  const user = await ensureFirebaseGoogleAuth(emailHint);
  return user.uid;
}

/** History window — keep listeners/reads bounded to ~13 months. */
function entriesCutoff(): string {
  return addDays(todayKey(), -400);
}

/* ---------------------------------------------------------------- habits --- */

export async function fetchHabits(emailHint: string): Promise<Habit[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(habitsCol(uid));
  return snap.docs
    .map((d) => coerceHabit(d.id, d.data()))
    .filter((h): h is Habit => h !== null);
}

export async function saveHabit(emailHint: string, habit: Habit): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(habitsCol(uid), habit.id),
    { ...habitToDoc(habit), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function deleteHabit(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(habitsCol(uid), id));
}

export function subscribeHabits(
  emailHint: string,
  cb: (habits: Habit[]) => void
): () => void {
  return listen(emailHint, (uid) =>
    onSnapshot(
      habitsCol(uid),
      (snap) =>
        cb(
          snap.docs
            .map((d) => coerceHabit(d.id, d.data()))
            .filter((h): h is Habit => h !== null)
        ),
      onListenError("habits")
    )
  );
}

/* --------------------------------------------------------------- entries --- */

export async function fetchEntries(emailHint: string): Promise<HabitEntry[]> {
  const uid = await uidFor(emailHint);
  const snap = await getDocs(
    query(entriesCol(uid), where("day", ">=", entriesCutoff()))
  );
  return snap.docs
    .map((d) => coerceEntry(d.id, d.data()))
    .filter((e): e is HabitEntry => e !== null);
}

export async function saveEntry(
  emailHint: string,
  entry: HabitEntry
): Promise<void> {
  const uid = await uidFor(emailHint);
  await setDoc(
    doc(entriesCol(uid), entry.id),
    {
      habitId: entry.habitId,
      day: entry.day,
      status: entry.status,
      count: entry.count,
      note: entry.note ?? "",
      at: entry.at ?? null,
      createdAt: entry.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteEntry(emailHint: string, id: string): Promise<void> {
  const uid = await uidFor(emailHint);
  await deleteDoc(doc(entriesCol(uid), id));
}

export function subscribeEntries(
  emailHint: string,
  cb: (entries: HabitEntry[]) => void
): () => void {
  const cutoff = entriesCutoff();
  return listen(emailHint, (uid) =>
    onSnapshot(
      query(entriesCol(uid), where("day", ">=", cutoff)),
      (snap) =>
        cb(
          snap.docs
            .map((d) => coerceEntry(d.id, d.data()))
            .filter((e): e is HabitEntry => e !== null)
        ),
      onListenError("entries")
    )
  );
}

/* --------------------------------------------------- realtime plumbing --- */

type Unsub = () => void;

function onListenError(label: string) {
  return (err: unknown) => {
    console.error(`[habits] ${label} listener error:`, err);
  };
}

function listen(emailHint: string, attach: (uid: string) => Unsub): Unsub {
  let unsub: Unsub = () => {};
  let cancelled = false;
  uidFor(emailHint)
    .then((uid) => {
      if (!cancelled) unsub = attach(uid);
    })
    .catch((err) => {
      console.error("[habits] listener auth failed:", err);
    });
  return () => {
    cancelled = true;
    unsub();
  };
}
