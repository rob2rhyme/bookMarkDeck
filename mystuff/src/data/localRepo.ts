// Local-first implementation of InventoryRepo over a KeyValueStore.
//
// Collection keys mirror the web app's Firestore layout (inventoryItems,
// inventoryLocations, inventoryWishlist, inventorySettings) so the Firestore
// adapter is a drop-in sibling rather than a reshaping exercise.

import {
  DEFAULT_INVENTORY_SETTINGS,
  normalizeSettings,
  type InventoryItem,
  type InventoryLocation,
  type InventorySettings,
  type WishlistItem,
} from "@/lib/types";
import type { InventoryRepo, KeyValueStore } from "./repo";

const KEY = {
  items: "inventoryItems",
  locations: "inventoryLocations",
  wishlist: "inventoryWishlist",
  settings: "inventorySettings",
} as const;

/** Read a JSON array, tolerating absent/corrupt values rather than throwing. */
async function readList<T>(store: KeyValueStore, key: string): Promise<T[]> {
  try {
    const raw = await store.get(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // A corrupt blob must not brick the app — an empty collection is recoverable,
    // a crash on launch is not.
    return [];
  }
}

async function writeList<T>(store: KeyValueStore, key: string, rows: T[]): Promise<void> {
  await store.set(key, JSON.stringify(rows));
}

/** Insert or replace by id, preserving order (existing rows keep their slot). */
function upsertBy<T extends { id: string }>(rows: T[], next: T): T[] {
  const i = rows.findIndex((r) => r.id === next.id);
  if (i === -1) return [...rows, next];
  const copy = rows.slice();
  copy[i] = next;
  return copy;
}

export function createLocalRepo(store: KeyValueStore): InventoryRepo {
  return {
    /* items */
    async listItems() {
      return readList<InventoryItem>(store, KEY.items);
    },
    async getItem(id) {
      const rows = await readList<InventoryItem>(store, KEY.items);
      return rows.find((r) => r.id === id) ?? null;
    },
    async upsertItem(item) {
      const rows = await readList<InventoryItem>(store, KEY.items);
      await writeList(store, KEY.items, upsertBy(rows, item));
    },
    async deleteItem(id) {
      const rows = await readList<InventoryItem>(store, KEY.items);
      await writeList(
        store,
        KEY.items,
        rows.filter((r) => r.id !== id)
      );
    },

    /* locations */
    async listLocations() {
      return readList<InventoryLocation>(store, KEY.locations);
    },
    async upsertLocation(location) {
      const rows = await readList<InventoryLocation>(store, KEY.locations);
      await writeList(store, KEY.locations, upsertBy(rows, location));
    },
    async deleteLocation(id) {
      const rows = await readList<InventoryLocation>(store, KEY.locations);
      await writeList(
        store,
        KEY.locations,
        rows.filter((r) => r.id !== id)
      );
    },

    /* wishlist */
    async listWishlist() {
      return readList<WishlistItem>(store, KEY.wishlist);
    },
    async upsertWish(wish) {
      const rows = await readList<WishlistItem>(store, KEY.wishlist);
      await writeList(store, KEY.wishlist, upsertBy(rows, wish));
    },
    async deleteWish(id) {
      const rows = await readList<WishlistItem>(store, KEY.wishlist);
      await writeList(
        store,
        KEY.wishlist,
        rows.filter((r) => r.id !== id)
      );
    },

    /* settings */
    async getSettings(): Promise<InventorySettings> {
      try {
        const raw = await store.get(KEY.settings);
        if (!raw) return DEFAULT_INVENTORY_SETTINGS;
        return normalizeSettings(JSON.parse(raw));
      } catch {
        return DEFAULT_INVENTORY_SETTINGS;
      }
    },
    async saveSettings(settings) {
      await store.set(KEY.settings, JSON.stringify(normalizeSettings(settings)));
    },
  };
}
