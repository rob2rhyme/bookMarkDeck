"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteItem,
  fetchItems,
  saveItem,
  subscribeItems,
  todayKey,
} from "@/features/inventory/data/inventoryData";
import type { InventoryItem } from "@/features/inventory/lib/types";

const BASE_KEY = "bookmarkdeck:inventory:items:v1";

function keyFor(email?: string | null) {
  return email ? `${BASE_KEY}:${email}` : BASE_KEY;
}

function loadLocal(email?: string | null): InventoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is InventoryItem =>
          i && typeof i.id === "string" && typeof i.name === "string"
      )
      // Backfill array fields for items cached before the field existed.
      .map((i) => ({
        ...i,
        tags: Array.isArray(i.tags) ? i.tags : [],
        links: Array.isArray(i.links) ? i.links : [],
        photos: Array.isArray(i.photos) ? i.photos : [],
      }));
  } catch {
    return [];
  }
}

/** A new blank item with sensible defaults — the form fills the rest. */
export function blankItem(currency: string): InventoryItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    locationId: null,
    tags: [],
    quantity: 1,
    currency,
    links: [],
    photos: [],
    lentTo: null,
    lentDate: null,
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
}

/**
 * Inventory items: hook owns state, starting from a safe default and hydrating
 * from localStorage after mount (hydration-safe). localStorage is a per-user
 * cache; cloud sync is via a live Firestore subscription plus explicit
 * push/pull. Writes are optimistic and fail-safe.
 */
export function useInventory(email?: string | null, connected = false) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setItems(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(items));
    } catch {}
  }, [items, hydrated, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await Promise.all(itemsRef.current.map((i) => saveItem(email, i)));
  }, [canSync, email]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    setItems(await fetchItems(email));
  }, [canSync, email]);

  // On connect: seed any local-only items to the cloud (items the cloud doesn't
  // have yet), THEN attach the live listener — so the first snapshot doesn't
  // drop items created before connecting. Existing cloud items win otherwise.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      const cloud = await fetchItems(email);
      const cloudIds = new Set(cloud.map((i) => i.id));
      await Promise.all(
        itemsRef.current
          .filter((i) => !cloudIds.has(i.id))
          .map((i) => saveItem(email, i).catch(() => {}))
      );
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) unsub = subscribeItems(email, setItems);
      });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  /** Insert or replace an item (full document). */
  const upsertItem = useCallback(
    (item: InventoryItem) => {
      const clean = { ...item, name: item.name.trim(), updatedAt: new Date().toISOString() };
      if (!clean.name) return;
      setItems((prev) => {
        const exists = prev.some((i) => i.id === clean.id);
        return exists
          ? prev.map((i) => (i.id === clean.id ? clean : i))
          : [clean, ...prev];
      });
      if (canSync && email) saveItem(email, clean).catch(() => {});
    },
    [canSync, email]
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (canSync && email) deleteItem(email, id).catch(() => {});
    },
    [canSync, email]
  );

  /** Toggle archived without opening the editor. */
  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      setItems((prev) => {
        const next = prev.map((i) =>
          i.id === id ? { ...i, archived, updatedAt: new Date().toISOString() } : i
        );
        const updated = next.find((i) => i.id === id);
        if (canSync && email && updated) saveItem(email, updated).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  const active = useMemo(() => items.filter((i) => !i.archived), [items]);

  return {
    items,
    active,
    hydrated,
    today: todayKey,
    upsertItem,
    removeItem,
    setArchived,
    pushToCloud,
    pullFromCloud,
    setItems,
  };
}
