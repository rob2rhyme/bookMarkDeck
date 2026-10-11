"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { reminderCountFor } from "@/features/inventory/lib/value";
import type { InventoryItem } from "@/features/inventory/lib/types";
// Dependency-free, so the app shell doesn't pull the firebase-heavy data
// module into its bundle.
import { todayKey } from "@/lib/dayKey";

// Must match the cache key useInventory writes.
const ITEMS_KEY = "bookmarkdeck:inventory:items:v1";

function readCount(email?: string | null): number {
  if (typeof window === "undefined" || !email) return 0;
  try {
    const raw = window.localStorage.getItem(`${ITEMS_KEY}:${email}`);
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return 0;
    return reminderCountFor(items as InventoryItem[], todayKey());
  } catch {
    return 0;
  }
}

/**
 * How many inventory items need a look — warranties ending/ended, upkeep
 * due/soon, overdue returns — for the "My Stuff" nav badge. Reads the per-user
 * localStorage cache (hydration-safe: starts at 0, fills after mount), so it's
 * a cross-page hint; the /inventory Attention panel is the live source. Re-reads
 * on navigation, tab focus, and cross-tab storage writes.
 */
export function useInventoryReminderCount(email?: string | null): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(readCount(email));
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith(ITEMS_KEY)) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [email, pathname]);

  return count;
}
