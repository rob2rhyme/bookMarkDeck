"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteFolder,
  fetchFolders,
  saveFolder,
  subscribeFolders,
} from "@/features/filing/data/filingData";
import {
  clearPendingUpserts,
  flushPendingDeletes,
  queueDelete,
  queueUpsert,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import { recordSyncedIds, toUpload } from "@/utils/syncedIds";
import { isCheckedOut } from "@/features/filing/lib/breadcrumb";
import { todayKey } from "@/lib/dayKey";
import { checkOutPatch, returnPatch } from "@/features/filing/lib/custody";
import type {
  FilingActivity,
  FilingActivityType,
  FilingFolder,
} from "@/features/filing/lib/types";

const BASE_KEY = "bookmarkdeck:filing:folders:v1";
const MAX_ACTIVITY = 300;


const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

function loadLocal(email?: string | null): FilingFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is FilingFolder =>
        f && typeof f.id === "string" && typeof f.name === "string"
    );
  } catch {
    return [];
  }
}

export type NewFolder = {
  name: string;
  homePlaceId?: string | null;
  partyId?: string | null;
  category?: string;
  aliases?: string[];
};

export function useFilingFolders(email?: string | null, connected = false) {
  const [folders, setFolders] = useState<FilingFolder[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const ref = useRef(folders);
  useEffect(() => {
    ref.current = folders;
  }, [folders]);

  useEffect(() => {
    setFolders(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(folders));
    } catch {
      /* quota */
    }
  }, [folders, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      // Replay deletes made while disconnected first, then upload what the cloud
      // NEVER had plus what was edited while disconnected (toUpload). A record
      // it had at the last snapshot and lacks now was deleted on another device
      // — uploading "everything the cloud lacks" recreated it for everyone.
      await flushPendingDeletes("filingFolders", email, (id) => deleteFolder(email, id));
      const cloud = await fetchFolders(email);
      const cloudIds = new Set(cloud.map((f) => f.id));
      await Promise.all(
        toUpload(ref.current, cloudIds, "filingFolders", email).map((f) =>
          saveFolder(email, f).catch(() => {})
        )
      );
      clearPendingUpserts("filingFolders", email);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          unsub = subscribeFolders(email, (cloud) => {
            recordSyncedIds("filingFolders", email, cloud.map((f) => f.id));
            setFolders(cloud);
          });
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  // A rejected write (e.g. a doc over Firestore's 1 MiB cap) should be
  // diagnosable rather than silent.
  const onSaveError = useCallback((err: unknown) => {
    console.error("[filing] folder save failed:", err);
  }, []);

  const addFolder = useCallback(
    (input: NewFolder): FilingFolder | null => {
      const name = input.name.trim();
      if (!name) return null;
      const folder: FilingFolder = {
        id: crypto.randomUUID(),
        name,
        homePlaceId: input.homePlaceId ?? null,
        currentPlaceId: null,
        parentId: null,
        partyId: input.partyId ?? null,
        category: input.category?.trim() || undefined,
        aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setFolders((prev) => [...prev, folder]);
      if (canSync && email) saveFolder(email, folder).catch(onSaveError);
      else queueUpsert("filingFolders", email, folder.id);
      return folder;
    },
    [canSync, email, onSaveError]
  );

  const patch = useCallback(
    (id: string, fn: (f: FilingFolder) => FilingFolder) => {
      setFolders((prev) => {
        const next = prev.map((f) =>
          f.id === id ? { ...fn(f), updatedAt: new Date().toISOString() } : f
        );
        const updated = next.find((f) => f.id === id);
        if (canSync && email && updated) saveFolder(email, updated).catch(onSaveError);
        else if (updated) queueUpsert("filingFolders", email, updated.id);
        return next;
      });
    },
    [canSync, email, onSaveError]
  );

  const updateFolder = useCallback(
    (id: string, changes: Partial<Omit<FilingFolder, "id">>) =>
      patch(id, (f) => ({ ...f, ...changes })),
    [patch]
  );

  const setArchived = useCallback(
    (id: string, archived: boolean) => patch(id, (f) => ({ ...f, archived })),
    [patch]
  );

  const withActivity = (
    f: FilingFolder,
    type: FilingActivityType,
    extra: Partial<FilingActivity> = {}
  ): FilingActivity[] =>
    [
      ...(f.activity ?? []),
      { id: crypto.randomUUID(), type, at: new Date().toISOString(), ...extra },
    ].slice(-MAX_ACTIVITY);

  /**
   * Send a folder out. There is no flag to set — moving `currentPlaceId` away
   * from `homePlaceId` IS being checked out, so the two can never disagree.
   * Place names are snapshotted onto the activity entry so the history still
   * reads correctly after a place is renamed or deleted.
   */
  const checkOut = useCallback(
    (
      id: string,
      input: { toPlaceId: string | null; heldBy?: string | null; dueBack?: string | null },
      placeName?: (id: string | null) => string | undefined
    ) =>
      patch(id, (f) => ({
        ...f,
        ...checkOutPatch({ ...input, on: todayKey() }), // local: "out N days" counts from it
        activity: withActivity(f, "taken", {
          to: input.heldBy?.trim() || undefined,
          fromPlace: placeName?.(f.currentPlaceId ?? f.homePlaceId),
          toPlace: placeName?.(input.toPlaceId),
        }),
      })),
    [patch]
  );

  /** Bring it home: clears the custody record, keeps the event on the timeline. */
  const returnFolder = useCallback(
    (id: string, placeName?: (id: string | null) => string | undefined) =>
      patch(id, (f) => ({
        ...f,
        ...returnPatch(),
        activity: withActivity(f, "returned", {
          fromPlace: placeName?.(f.currentPlaceId),
          toPlace: placeName?.(f.homePlaceId),
        }),
      })),
    [patch]
  );

  /**
   * A hold mutes the shred reminder without touching the clock, so lifting it
   * puts the folder straight back in the queue rather than restarting the years.
   */
  const setKeepReason = useCallback(
    (id: string, reason: string | null) =>
      patch(id, (f) => ({ ...f, keepReason: reason?.trim() || null })),
    [patch]
  );

  const removeFolder = useCallback(
    (id: string) => {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      unqueueUpsert("filingFolders", email, id); // an edit to it must not be pushed back
      if (canSync && email) deleteFolder(email, id).catch(onSaveError);
      else queueDelete("filingFolders", email, id); // replayed on connect
    },
    [canSync, email, onSaveError]
  );

  /**
   * Restore from a backup: merge by id, then push each result to the cloud so an
   * import isn't stranded on this device. Never deletes — see lib/exportFiling.
   */
  const importMany = useCallback(
    (incoming: FilingFolder[]) => {
      if (incoming.length === 0) return;
      setFolders((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const item of incoming) {
          const merged = { ...(byId.get(item.id) ?? {}), ...item } as FilingFolder;
          byId.set(item.id, merged);
          if (canSync && email) saveFolder(email, merged).catch(onSaveError);
          else queueUpsert("filingFolders", email, merged.id);
        }
        return [...byId.values()];
      });
    },
    [canSync, email, onSaveError]
  );

  const active = useMemo(() => folders.filter((f) => !f.archived), [folders]);
  const out = useMemo(() => active.filter(isCheckedOut), [active]);
  const byId = useMemo(
    () => Object.fromEntries(folders.map((f) => [f.id, f])),
    [folders]
  );

  return {
    folders,
    active,
    /** Folders currently somewhere other than home — the custody view (Phase 4). */
    out,
    byId,
    hydrated,
    importMany,
    addFolder,
    updateFolder,
    setArchived,
    checkOut,
    returnFolder,
    setKeepReason,
    removeFolder,
    setFolders,
  };
}
