"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deletePlace,
  fetchPlaces,
  savePlace,
  subscribePlaces,
} from "@/features/filing/data/filingData";
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
      const cloud = await fetchPlaces(email);
      const cloudIds = new Set(cloud.map((p) => p.id));
      await Promise.all(
        ref.current
          .filter((p) => !cloudIds.has(p.id))
          .map((p) => savePlace(email, p).catch(() => {}))
      );
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) unsub = subscribePlaces(email, setPlaces);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  const addPlace = useCallback(
    (name: string, parentId: string | null = null, kind?: PlaceKind): FilingPlace | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const place: FilingPlace = {
        id: crypto.randomUUID(),
        name: trimmed,
        parentId,
        kind,
        sortOrder: ref.current.length,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setPlaces((prev) => [...prev, place]);
      if (canSync && email) savePlace(email, place).catch(() => {});
      return place;
    },
    [canSync, email]
  );

  const updatePlace = useCallback(
    (id: string, patch: Partial<Omit<FilingPlace, "id">>) => {
      setPlaces((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
        );
        const updated = next.find((p) => p.id === id);
        if (canSync && email && updated) savePlace(email, updated).catch(() => {});
        return next;
      });
    },
    [canSync, email]
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
        if (canSync && email) {
          deletePlace(email, id).catch(() => {});
          orphans.forEach((p) =>
            savePlace(email, { ...p, parentId: null }).catch(() => {})
          );
        }
        return next;
      });
    },
    [canSync, email]
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
          if (canSync && email) savePlace(email, merged).catch(() => {});
        }
        return [...byId.values()];
      });
    },
    [canSync, email]
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
    updatePlace,
    movePlace,
    removePlace,
    setPlaces,
  };
}
