"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteLocation,
  fetchLocations,
  saveLocation,
  subscribeLocations,
} from "@/features/inventory/data/inventoryData";
import {
  clearPendingUpserts,
  flushPendingDeletes,
  queueDelete,
  queueUpsert,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import { recordSyncedIds, toUpload } from "@/utils/syncedIds";
import type { InventoryLocation } from "@/features/inventory/lib/types";

const BASE_KEY = "bookmarkdeck:inventory:locations:v1";

function keyFor(email?: string | null) {
  return email ? `${BASE_KEY}:${email}` : BASE_KEY;
}

function loadLocal(email?: string | null): InventoryLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is InventoryLocation =>
        l && typeof l.id === "string" && typeof l.name === "string"
    );
  } catch {
    return [];
  }
}

export type LocationNode = InventoryLocation & { children: LocationNode[]; depth: number };

/** Build a nested tree; orphaned children (missing parent) surface at the root. */
export function buildTree(locations: InventoryLocation[]): LocationNode[] {
  const byId = new Map(locations.map((l) => [l.id, { ...l, children: [], depth: 0 } as LocationNode]));
  const roots: LocationNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: LocationNode[], depth: number) => {
    nodes.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** Flatten a tree to a depth-ordered list — handy for indented <option>s. */
export function flattenTree(nodes: LocationNode[]): LocationNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export function useInventoryLocations(email?: string | null, connected = false) {
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const ref = useRef(locations);
  useEffect(() => {
    ref.current = locations;
  }, [locations]);

  useEffect(() => {
    setLocations(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(locations));
    } catch {}
  }, [locations, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      // Replay deletes made while disconnected first, then upload what the cloud
      // NEVER had plus what was edited while disconnected (toUpload). A record
      // it had at the last snapshot and lacks now was deleted on another device
      // — uploading "everything the cloud lacks" recreated it for everyone (an
      // item pointing at photos already purged).
      await flushPendingDeletes("inventoryLocations", email, (id) => deleteLocation(email, id));
      const cloud = await fetchLocations(email);
      const cloudIds = new Set(cloud.map((l) => l.id));
      await Promise.all(
        toUpload(ref.current, cloudIds, "inventoryLocations", email).map((l) =>
          saveLocation(email, l).catch(() => {})
        )
      );
      clearPendingUpserts("inventoryLocations", email);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          unsub = subscribeLocations(email, (cloud) => {
            recordSyncedIds("inventoryLocations", email, cloud.map((l) => l.id));
            setLocations(cloud);
          });
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  const addLocation = useCallback(
    (name: string, parentId: string | null = null): InventoryLocation | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const loc: InventoryLocation = {
        id: crypto.randomUUID(),
        name: trimmed,
        parentId,
        sortOrder: ref.current.length,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setLocations((prev) => [...prev, loc]);
      if (canSync && email) saveLocation(email, loc).catch(() => {});
      else queueUpsert("inventoryLocations", email, loc.id);
      return loc;
    },
    [canSync, email]
  );

  const renameLocation = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setLocations((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l));
        const updated = next.find((l) => l.id === id);
        if (canSync && email && updated) saveLocation(email, updated).catch(() => {});
        else if (updated) queueUpsert("inventoryLocations", email, updated.id);
        return next;
      });
    },
    [canSync, email]
  );

  // Removing a location also detaches its direct children (they float to root)
  // so the tree never points at a missing parent.
  const removeLocation = useCallback(
    (id: string) => {
      setLocations((prev) => {
        const reparented = prev.map((l) =>
          l.parentId === id ? { ...l, parentId: null } : l
        );
        const next = reparented.filter((l) => l.id !== id);
        const orphans = reparented.filter(
          (l) => l.parentId === null && prev.find((p) => p.id === l.id)?.parentId === id
        );
        unqueueUpsert("inventoryLocations", email, id); // an edit to it must not be pushed back
        if (canSync && email) {
          deleteLocation(email, id).catch(() => {});
          orphans.forEach((l) => saveLocation(email, l).catch(() => {}));
        } else {
          queueDelete("inventoryLocations", email, id); // replayed on connect
          orphans.forEach((l) => queueUpsert("inventoryLocations", email, l.id));
        }
        return next;
      });
    },
    [canSync, email]
  );

  const tree = useMemo(() => buildTree(locations), [locations]);
  const nameById = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.name])),
    [locations]
  );

  return {
    locations,
    tree,
    nameById,
    addLocation,
    renameLocation,
    removeLocation,
    setLocations,
  };
}
