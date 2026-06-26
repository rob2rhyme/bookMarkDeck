"use client";

// Cloud-remembered one-shot UI flags (e.g. "welcome seen", "habits onboarded").
//
// localStorage alone wasn't enough: Safari/ITP can evict it between sessions, so
// first-run modals kept reappearing. These flags live in Firestore per account
// (users/{uid}/prefs/ui) with localStorage as an instant cache. A logged-in user
// dismisses each modal once, ever — across cache clears and devices.
//
// Covered by the existing recursive owner rule (match /users/{uid}/{document=**}),
// so no Firestore rule change is needed.

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export type UiFlag = "welcomeSeen" | "habitsOnboarded";

const CACHE_KEY = "bd:ui-flags:v1";

function readCache(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(next: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Synchronous, no network — true only if this device already knows it's seen. */
export function getCachedFlag(flag: UiFlag): boolean {
  return readCache()[flag] === true;
}

function cacheFlag(flag: UiFlag): void {
  const next = readCache();
  next[flag] = true;
  writeCache(next);
}

/**
 * Resolve the current Firebase uid without forcing a popup: returns immediately
 * if a session already exists, else waits briefly for one to settle (other
 * features sign Firebase in for Firestore on load), then gives up.
 */
function currentUid(timeoutMs = 3000): Promise<string | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (uid: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(uid);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) finish(user.uid);
    });
  });
}

const prefsDoc = (uid: string) => doc(db, "users", uid, "prefs", "ui");

/**
 * Has this flag been seen? Checks the device cache first (instant), then the
 * cloud (in case the cache was evicted but the account remembers). Resolves
 * `false` when there's no Firebase session to ask.
 */
export async function fetchUiFlag(flag: UiFlag): Promise<boolean> {
  if (getCachedFlag(flag)) return true;
  const uid = await currentUid();
  if (!uid) return false;
  try {
    const snap = await getDoc(prefsDoc(uid));
    const seen = snap.exists() && snap.data()?.[flag] === true;
    if (seen) cacheFlag(flag);
    return seen;
  } catch {
    return false;
  }
}

/** Mark a flag seen: cache instantly, then best-effort persist to the cloud. */
export async function markUiFlag(flag: UiFlag): Promise<void> {
  cacheFlag(flag);
  try {
    const uid = auth.currentUser?.uid ?? (await currentUid());
    if (!uid) return;
    await setDoc(
      prefsDoc(uid),
      { [flag]: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    /* best-effort — the cache already prevents a re-show on this device */
  }
}
