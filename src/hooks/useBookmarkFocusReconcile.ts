"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { logActivity, subscribeSessions } from "@/features/focus/data/focusData";
import {
  clearBookmarkFocusLink,
  hasReconcilableBlock,
  peekBookmarkFocusLink,
  todayKey,
} from "@/lib/bookmarkFocusLink";

/**
 * Bookmarks → focus → record of progress. If the user launched a focus session
 * from a bookmark and completed a block today, log a one-off "bookmark" activity
 * event so the resource shows up in the focus timeline.
 *
 * - No-op (zero cost) unless a pending link exists.
 * - Reflects an *existing* Firebase session via onAuthStateChanged; it never
 *   forces an interactive sign-in just to reconcile (ensureFirebaseGoogleAuth
 *   resolves silently once a user is present).
 * - One-way dependency: the bookmark/home side reads focus; focus never imports
 *   bookmarks.
 */
export function useBookmarkFocusReconcile(
  email: string | null | undefined
): void {
  useEffect(() => {
    if (!email) return;

    const link = peekBookmarkFocusLink();
    if (!link) return;

    const today = todayKey();
    if (link.day !== today) {
      clearBookmarkFocusLink(); // from a previous day — expire it, never logs
      return;
    }

    let done = false;
    let unsubSessions: () => void = () => {};

    // Only subscribe once an existing Firebase user is present — fires with the
    // current state on attach, so a not-signed-in user simply does nothing.
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || done) return;
      unsubSessions();
      unsubSessions = subscribeSessions(email, (sessions) => {
        if (done || !hasReconcilableBlock(link, sessions, today)) return;
        done = true;
        clearBookmarkFocusLink(); // clear first so this can't loop
        logActivity(
          email,
          "bookmark",
          `Focused on “${link.title}”`,
          today
        ).catch(() => {});
        unsubSessions();
      });
    });

    return () => {
      unsubAuth();
      unsubSessions();
    };
  }, [email]);
}
