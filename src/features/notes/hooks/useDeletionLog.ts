"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { saveDeletions, subscribeDeletions } from "@/features/notes/data/notesData";
import {
  DELETIONS_CHANGED,
  deletionLogKey,
  hasEntriesMissingFrom,
  MAX_DELETIONS,
  mergeDeletions,
  normalizeDeletions,
  readDeletions,
  writeDeletions,
  type DeletedEntry,
} from "@/features/notes/lib/deletionLog";

function subscribe(cb: () => void): () => void {
  window.addEventListener(DELETIONS_CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(DELETIONS_CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * The account's deletion log (lib/deletionLog.ts): this device's cache, merged
 * with the cloud copy while connected. A merge that finds entries the cloud lacks
 * (deletes made offline) — or a cloud copy over the cap — writes the union back.
 */
export function useDeletionLog(email: string | null, canSync: boolean): DeletedEntry[] {
  // The raw string is the snapshot: stable between changes, so no render loop.
  const raw = useSyncExternalStore(
    subscribe,
    useCallback(() => {
      try {
        return window.localStorage.getItem(deletionLogKey(email)) ?? "[]";
      } catch {
        return "[]";
      }
    }, [email]),
    () => "[]"
  );
  const entries = useMemo(() => {
    try {
      return normalizeDeletions(JSON.parse(raw));
    } catch {
      return [];
    }
  }, [raw]);

  useEffect(() => {
    if (!canSync || !email) return;
    return subscribeDeletions(email, (cloud) => {
      const local = readDeletions(email);
      const merged = mergeDeletions(cloud, local);
      writeDeletions(email, merged);
      if (hasEntriesMissingFrom(local, cloud) || cloud.length > MAX_DELETIONS) {
        saveDeletions(email, merged).catch(() => {});
      }
    });
  }, [canSync, email]);

  return entries;
}
