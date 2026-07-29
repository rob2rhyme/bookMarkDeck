import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { InventoryItem } from "@/lib/types";
import { createLocalRepo } from "./localRepo";
import { createSqliteStore } from "./sqliteStore";
import type { InventoryRepo } from "./repo";

type ItemsState = {
  items: InventoryItem[];
  loading: boolean;
  repo: InventoryRepo;
  /** Re-read from storage. Called after every write so the UI never drifts. */
  refresh: () => Promise<void>;
  saveItem: (item: InventoryItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setItems(await repo.listItems());
    } catch {
      // Storage failures must not blank the screen; keep the last-known list.
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

  const value = useMemo(
    () => ({ items, loading, repo, refresh, saveItem, removeItem }),
    [items, loading, repo, refresh, saveItem, removeItem]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): ItemsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
