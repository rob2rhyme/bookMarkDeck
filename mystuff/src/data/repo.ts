// The data boundary for the whole app.
//
// Screens talk to THIS interface and nothing else. That is what lets the
// storage engine change without touching UI: the app ships on a local store
// first, gains a Firestore adapter for cross-device sync (same Firebase
// project and same `users/{uid}` schema as the web app, so both read the same
// data during the transition), and can later swap to SQLite for scale — all
// behind this one contract.

import type {
  InventoryItem,
  InventoryLocation,
  InventorySettings,
  WishlistItem,
} from "@/lib/types";

export type InventoryRepo = {
  /* items */
  listItems(): Promise<InventoryItem[]>;
  getItem(id: string): Promise<InventoryItem | null>;
  upsertItem(item: InventoryItem): Promise<void>;
  deleteItem(id: string): Promise<void>;

  /* locations */
  listLocations(): Promise<InventoryLocation[]>;
  upsertLocation(location: InventoryLocation): Promise<void>;
  deleteLocation(id: string): Promise<void>;

  /* wishlist */
  listWishlist(): Promise<WishlistItem[]>;
  upsertWish(wish: WishlistItem): Promise<void>;
  deleteWish(id: string): Promise<void>;

  /* settings */
  getSettings(): Promise<InventorySettings>;
  saveSettings(settings: InventorySettings): Promise<void>;
};

/**
 * Async key→JSON store. The only thing an adapter needs to provide, which keeps
 * the repository itself pure and unit-testable (see repo.test.ts) and makes the
 * real backends — expo-sqlite, AsyncStorage, Firestore — thin.
 */
export type KeyValueStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

/** In-memory store. Used by tests, and as a safe default before a real one is wired. */
export function createMemoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
}
