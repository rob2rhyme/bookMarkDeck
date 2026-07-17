// The app's single source of truth: items, wishlist, locations — loaded from
// on-device storage, saved optimistically on every change, with delete-undo.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  makeId,
  newestFirst,
  removeById,
  restoreAt,
  upsertById,
} from "@/data/core";
import {
  loadCollection,
  loadSettings,
  saveCollection,
  saveSettings,
} from "@/data/storage";
import { missingStarterRooms } from "@/lib/starterRooms";
import type {
  InventoryItem,
  InventoryLocation,
  WishlistItem,
} from "@/lib/types";

type UndoAction = { label: string; run: () => void } | null;

type InventoryStore = {
  hydrated: boolean;
  items: InventoryItem[];
  wishlist: WishlistItem[];
  locations: InventoryLocation[];
  upsertItem: (item: InventoryItem) => void;
  removeItem: (id: string) => void;
  upsertWish: (wish: WishlistItem) => void;
  removeWish: (id: string) => void;
  addLocation: (name: string, parentId?: string | null) => InventoryLocation;
  seedStarterRooms: () => void;
  undo: UndoAction;
  dismissUndo: () => void;
};

const Ctx = createContext<InventoryStore | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [undo, setUndo] = useState<UndoAction>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadCollection<InventoryItem>("items"),
      loadCollection<WishlistItem>("wishlist"),
      loadCollection<InventoryLocation>("locations"),
      loadSettings(),
    ]).then(([i, w, l, s]) => {
      if (!alive) return;
      setItems(newestFirst(i));
      setWishlist(newestFirst(w));
      setLocations(l);
      setHydrated(true);
      // First run: seed the starter rooms once so the app is never blank.
      if (!s.seededRooms && l.length === 0) {
        const now = new Date().toISOString();
        const rooms = missingStarterRooms([]).map((name, idx) => ({
          id: makeId(),
          name,
          parentId: null,
          sortOrder: idx,
          createdAt: now,
          updatedAt: null,
        }));
        setLocations(rooms);
        void saveCollection("locations", rooms);
        void saveSettings({ seededRooms: true });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const showUndo = useCallback((label: string, run: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ label, run });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }, []);

  const dismissUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }, []);

  const upsertItem = useCallback((item: InventoryItem) => {
    setItems((prev) => {
      const next = upsertById(prev, item);
      void saveCollection("items", next);
      return next;
    });
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const index = prev.findIndex((r) => r.id === id);
        const { rows, removed } = removeById(prev, id);
        if (removed) {
          void saveCollection("items", rows);
          showUndo(`Deleted “${removed.name || "item"}”`, () => {
            setItems((cur) => {
              const back = restoreAt(cur, removed, index);
              void saveCollection("items", back);
              return back;
            });
          });
        }
        return rows;
      });
    },
    [showUndo]
  );

  const upsertWish = useCallback((wish: WishlistItem) => {
    setWishlist((prev) => {
      const next = upsertById(prev, wish);
      void saveCollection("wishlist", next);
      return next;
    });
  }, []);

  const removeWish = useCallback(
    (id: string) => {
      setWishlist((prev) => {
        const index = prev.findIndex((r) => r.id === id);
        const { rows, removed } = removeById(prev, id);
        if (removed) {
          void saveCollection("wishlist", rows);
          showUndo(`Removed “${removed.name || "wish"}”`, () => {
            setWishlist((cur) => {
              const back = restoreAt(cur, removed, index);
              void saveCollection("wishlist", back);
              return back;
            });
          });
        }
        return rows;
      });
    },
    [showUndo]
  );

  const addLocation = useCallback(
    (name: string, parentId: string | null = null) => {
      const loc: InventoryLocation = {
        id: makeId(),
        name: name.trim(),
        parentId,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setLocations((prev) => {
        const next = [...prev, loc];
        void saveCollection("locations", next);
        return next;
      });
      return loc;
    },
    []
  );

  const seedStarterRooms = useCallback(() => {
    setLocations((prev) => {
      const now = new Date().toISOString();
      const add = missingStarterRooms(prev.map((l) => l.name)).map(
        (name, idx) => ({
          id: makeId(),
          name,
          parentId: null,
          sortOrder: prev.length + idx,
          createdAt: now,
          updatedAt: null,
        })
      );
      if (add.length === 0) return prev;
      const next = [...prev, ...add];
      void saveCollection("locations", next);
      return next;
    });
    void saveSettings({ seededRooms: true });
  }, []);

  const value = useMemo(
    () => ({
      hydrated,
      items,
      wishlist,
      locations,
      upsertItem,
      removeItem,
      upsertWish,
      removeWish,
      addLocation,
      seedStarterRooms,
      undo,
      dismissUndo,
    }),
    [
      hydrated,
      items,
      wishlist,
      locations,
      upsertItem,
      removeItem,
      upsertWish,
      removeWish,
      addLocation,
      seedStarterRooms,
      undo,
      dismissUndo,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInventory(): InventoryStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useInventory must be used inside InventoryProvider");
  return store;
}
