"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deletePlace,
  fetchPlaces,
  savePlace,
  subscribePlaces,
} from "@/features/filing/data/filingData";
import {
  durableDelete,
  durableSave,
  flushPendingDeletes,
  replayUpserts,
} from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";
import { recordSyncedIdsUnlessPending, toUpload } from "@/utils/syncedIds";
import { alphabetSplit } from "@/features/filing/lib/drawers";
import { buildTree, subtreeIds } from "@/features/filing/lib/tree";
import { placePathsById } from "@/features/filing/lib/breadcrumb";
import type { FilingPlace, PlaceKind } from "@/features/filing/lib/types";

const BASE_KEY = "bookmarkdeck:filing:places:v1";

const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

function loadLocal(email?: string | null): FilingPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FilingPlace =>
        p && typeof p.id === "string" && typeof p.name === "string"
    );
  } catch {
    return [];
  }
}

export function useFilingPlaces(email?: string | null, connected = false) {
  const [places, setPlaces] = useState<FilingPlace[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const ref = useRef(places);
  useEffect(() => {
    ref.current = places;
  }, [places]);

  useEffect(() => {
    setPlaces(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(places));
    } catch {
      /* quota — the cloud copy is still authoritative */
    }
  }, [places, hydrated, email]);

  // On connect: seed any local-only places to the cloud FIRST, then attach the
  // live listener — so the first snapshot can't drop records created before
  // connecting.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      // Replay deletes made while disconnected first, then upload what the cloud
      // NEVER had plus what was edited while disconnected (toUpload). A record
      // it had at the last snapshot and lacks now was deleted on another device
      // — uploading "everything the cloud lacks" recreated it for everyone.
      await flushPendingDeletes("filingPlaces", email, (id) => deletePlace(email, id));
      const cloud = await untilAnswered(() => fetchPlaces(email), () => cancelled);
      if (!cloud) return;
      const cloudIds = new Set(cloud.map((p) => p.id));
      // Each leaves the queue once it lands; one that failed is tried again next connect.
      // From the device cache, not this tab's copy: another tab may have edited a
      // queued record since this one loaded, and its copy is the one to send.
      await replayUpserts("filingPlaces", email, toUpload(loadLocal(email), cloudIds, "filingPlaces", email), (p) =>
        savePlace(email, p)
      );
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          unsub = subscribePlaces(email, (cloud, meta) => {
            recordSyncedIdsUnlessPending("filingPlaces", email, cloud.map((p) => p.id), meta);
            setPlaces(cloud);
          });
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  // A rejected write (e.g. a doc over Firestore's 1 MiB cap) should be
  // diagnosable rather than silent — same as the folders/documents hooks and
  // features/inventory/hooks/useInventory.ts.
  const onSaveError = useCallback((err: unknown) => {
    console.error("[filing] place save failed:", err);
  }, []);

  const addPlace = useCallback(
    (
      name: string,
      parentId: string | null = null,
      kind?: PlaceKind,
      contents?: string
    ): FilingPlace | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const place: FilingPlace = {
        id: crypto.randomUUID(),
        name: trimmed,
        parentId,
        kind,
        contents: contents?.trim() || undefined,
        sortOrder: ref.current.length,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setPlaces((prev) => [...prev, place]);
      durableSave("filingPlaces", email, place.id, canSync && email ? () => savePlace(email, place) : null).catch(onSaveError);
      return place;
    },
    [canSync, email, onSaveError]
  );

  /**
   * A cabinet and its drawers in one go. Built as a single batch rather than
   * repeated addPlace calls on purpose: `ref.current` only catches up on the
   * next render, so five calls in a row would hand every drawer the same
   * sortOrder and the cabinet would read 1, 10, 2 down its front.
   *
   * The A-Z scheme labels each drawer with the slice of the alphabet it holds,
   * which is the whole point of a labelled cabinet — see lib/drawers.ts.
   */
  const addCabinet = useCallback(
    (
      name: string,
      parentId: string | null,
      drawerCount: number,
      scheme: "letters" | "numbers"
    ): FilingPlace | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const count = Math.max(1, Math.min(12, Math.floor(drawerCount) || 1));
      const now = new Date().toISOString();

      const cabinet: FilingPlace = {
        id: crypto.randomUUID(),
        name: trimmed,
        parentId,
        kind: "cabinet",
        sortOrder: ref.current.length,
        createdAt: now,
        updatedAt: null,
      };
      const spans = scheme === "letters" ? alphabetSplit(count) : [];
      const drawers: FilingPlace[] = Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Drawer ${i + 1}`,
        parentId: cabinet.id,
        kind: "drawer" as const,
        contents: spans[i],
        sortOrder: i,
        createdAt: now,
        updatedAt: null,
      }));

      const batch = [cabinet, ...drawers];
      setPlaces((prev) => [...prev, ...batch]);
      batch.forEach((p) =>
        durableSave("filingPlaces", email, p.id, canSync && email ? () => savePlace(email, p) : null).catch(onSaveError)
      );
      return cabinet;
    },
    [canSync, email, onSaveError]
  );

  const updatePlace = useCallback(
    (id: string, patch: Partial<Omit<FilingPlace, "id">>) => {
      setPlaces((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
        );
        const updated = next.find((p) => p.id === id);
        if (updated)
          durableSave("filingPlaces", email, updated.id, canSync && email ? () => savePlace(email, updated) : null).catch(onSaveError);
        return next;
      });
    },
    [canSync, email, onSaveError]
  );

  /**
   * Reparent, refusing any move that would put a place inside its own subtree —
   * that would detach the whole branch from the root.
   */
  const movePlace = useCallback(
    (id: string, parentId: string | null): boolean => {
      if (id === parentId) return false;
      if (parentId && subtreeIds(ref.current, id).has(parentId)) return false;
      updatePlace(id, { parentId });
      return true;
    },
    [updatePlace]
  );

  // Removing a place detaches its direct children (they float to root) so the
  // tree never points at a missing parent.
  const removePlace = useCallback(
    (id: string) => {
      setPlaces((prev) => {
        const orphans = prev.filter((p) => p.parentId === id);
        const next = prev
          .map((p) => (p.parentId === id ? { ...p, parentId: null } : p))
          .filter((p) => p.id !== id);
        // Queued until each lands; the delete also drops a queued edit to it.
        const on = canSync && email;
        durableDelete("filingPlaces", email, id, on ? () => deletePlace(email, id) : null).catch(onSaveError);
        orphans.forEach((p) =>
          durableSave("filingPlaces", email, p.id, on ? () => savePlace(email, { ...p, parentId: null }) : null).catch(
            onSaveError
          )
        );
        return next;
      });
    },
    [canSync, email, onSaveError]
  );

  /**
   * Restore from a backup: merge by id, then push each result to the cloud so an
   * import isn't stranded on this device. Never deletes — see lib/exportFiling.
   */
  const importMany = useCallback(
    (incoming: FilingPlace[]) => {
      if (incoming.length === 0) return;
      setPlaces((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const item of incoming) {
          const merged = { ...(byId.get(item.id) ?? {}), ...item } as FilingPlace;
          byId.set(item.id, merged);
          durableSave("filingPlaces", email, merged.id, canSync && email ? () => savePlace(email, merged) : null).catch(onSaveError);
        }
        return [...byId.values()];
      });
    },
    [canSync, email, onSaveError]
  );

  const tree = useMemo(() => buildTree(places), [places]);
  const paths = useMemo(() => placePathsById(places), [places]);
  const nameById = useMemo(
    () => Object.fromEntries(places.map((p) => [p.id, p.name])),
    [places]
  );

  return {
    places,
    tree,
    paths,
    nameById,
    hydrated,
    importMany,
    addPlace,
    addCabinet,
    updatePlace,
    movePlace,
    removePlace,
    setPlaces,
  };
}
