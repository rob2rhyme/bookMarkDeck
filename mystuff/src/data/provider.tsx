import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { InventoryItem, InventoryLocation } from "@/lib/types";
import { planLocationDelete } from "@/lib/locationTree";
import { createLocalRepo } from "./localRepo";
import { createSqliteStore } from "./sqliteStore";
import type { InventoryRepo } from "./repo";

type ItemsState = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  loading: boolean;
  repo: InventoryRepo;
  /** Re-read from storage. Called after every write so the UI never drifts. */
  refresh: () => Promise<void>;
  saveItem: (item: InventoryItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  saveLocation: (location: InventoryLocation) => Promise<void>;
  /** Deletes a location, promoting its children and unassigning its items. */
  removeLocation: (id: string) => Promise<void>;
};

const Ctx = createContext<ItemsState | null>(null);

export function DataProvider({
  children,
  repo: injected,
}: {
  children: ReactNode;
  /** Tests and previews can inject a memory-backed repo instead of SQLite. */
  repo?: InventoryRepo;
}) {
  // Built once — creating it per render would reopen the database.
  const repo = useMemo(
    () => injected ?? createLocalRepo(createSqliteStore()),
    [injected]
  );

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [nextItems, nextLocations] = await Promise.all([
        repo.listItems(),
        repo.listLocations(),
      ]);
      setItems(nextItems);
      setLocations(nextLocations);
    } catch {
      // Storage failures must not blank the screen; keep the last-known state.
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveItem = useCallback(
    async (item: InventoryItem) => {
      await repo.upsertItem(item);
      await refresh();
    },
    [repo, refresh]
  );

  const removeItem = useCallback(
    async (id: string) => {
      await repo.deleteItem(id);
      await refresh();
    },
    [repo, refresh]
  );

  const saveLocation = useCallback(
    async (location: InventoryLocation) => {
      await repo.upsertLocation(location);
      await refresh();
    },
    [repo, refresh]
  );

  const removeLocation = useCallback(
    async (id: string) => {
      // Children are promoted and held items unassigned, so a delete can never
      // orphan a branch or leave items pointing at a location that is gone.
      const plan = planLocationDelete(locations, items, id, new Date().toISOString());
      await Promise.all(plan.reparentedLocations.map((l) => repo.upsertLocation(l)));
      await Promise.all(plan.unassignedItems.map((i) => repo.upsertItem(i)));
      await repo.deleteLocation(plan.removeId);
      await refresh();
    },
    [repo, refresh, locations, items]
  );

  const value = useMemo(
    () => ({
      items,
      locations,
      loading,
      repo,
      refresh,
      saveItem,
      removeItem,
      saveLocation,
      removeLocation,
    }),
    [
      items,
      locations,
      loading,
      repo,
      refresh,
      saveItem,
      removeItem,
      saveLocation,
      removeLocation,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): ItemsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
