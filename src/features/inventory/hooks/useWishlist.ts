"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteWishlist,
  fetchWishlist,
  saveWishlist,
  subscribeWishlist,
} from "@/features/inventory/data/inventoryData";
import {
  clearPendingUpserts,
  flushPendingDeletes,
  queueDelete,
  queueUpsert,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import { recordSyncedIdsUnlessPending, toUpload } from "@/utils/syncedIds";
import type { WishlistItem } from "@/features/inventory/lib/types";

const BASE_KEY = "bookmarkdeck:inventory:wishlist:v1";
const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

function loadLocal(email?: string | null): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is WishlistItem =>
        w && typeof w.id === "string" && typeof w.name === "string"
    );
  } catch {
    return [];
  }
}

/** The "want to buy" list — local-first, live Firestore sync when connected.
 *  Same shape as useInventory but lighter (no archive/photos). */
export function useWishlist(email?: string | null, connected = false) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);
  const ref = useRef(items);
  useEffect(() => {
    ref.current = items;
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

  // On connect: seed local-only entries, then attach the live listener.
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
      await flushPendingDeletes("inventoryWishlist", email, (id) => deleteWishlist(email, id));
      const cloud = await fetchWishlist(email);
      const cloudIds = new Set(cloud.map((w) => w.id));
      await Promise.all(
        toUpload(ref.current, cloudIds, "inventoryWishlist", email).map((w) =>
          saveWishlist(email, w).catch(() => {})
        )
      );
      clearPendingUpserts("inventoryWishlist", email);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          unsub = subscribeWishlist(email, (cloud, meta) => {
            recordSyncedIdsUnlessPending("inventoryWishlist", email, cloud.map((w) => w.id), meta);
            setItems(cloud);
          });
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  const upsert = useCallback(
    (w: WishlistItem) => {
      const clean = { ...w, name: w.name.trim() };
      if (!clean.name) return;
      setItems((prev) =>
        prev.some((x) => x.id === clean.id)
          ? prev.map((x) => (x.id === clean.id ? clean : x))
          : [clean, ...prev]
      );
      if (canSync && email) saveWishlist(email, clean).catch(() => {});
      else queueUpsert("inventoryWishlist", email, clean.id);
    },
    [canSync, email]
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((w) => w.id !== id));
      unqueueUpsert("inventoryWishlist", email, id); // an edit to it must not be pushed back
      if (canSync && email) deleteWishlist(email, id).catch(() => {});
      else queueDelete("inventoryWishlist", email, id); // replayed on connect
    },
    [canSync, email]
  );

  return { items, upsert, remove };
}
