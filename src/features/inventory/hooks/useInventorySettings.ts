"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSettings, saveSettings } from "@/features/inventory/data/inventoryData";
import {
  DEFAULT_INVENTORY_SETTINGS,
  normalizeSettings,
  type InventorySettings,
} from "@/features/inventory/lib/types";

const STORAGE_KEY = "bookmarkdeck:inventory:settings:v1";

function keyFor(email?: string | null) {
  return email ? `${STORAGE_KEY}:${email}` : STORAGE_KEY;
}

function loadLocal(email?: string | null): InventorySettings {
  if (typeof window === "undefined") return DEFAULT_INVENTORY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_INVENTORY_SETTINGS;
  } catch {
    return DEFAULT_INVENTORY_SETTINGS;
  }
}

/**
 * Inventory settings: deterministic defaults on first render (hydration-safe),
 * localStorage after mount, synced to Firestore when connected. A local change
 * made before connecting is preserved (never clobbered by a stale remote read).
 */
export function useInventorySettings(email?: string | null, connected = false) {
  const [settings, setSettings] = useState<InventorySettings>(DEFAULT_INVENTORY_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const dirtyRef = useRef(false);

  useEffect(() => {
    setSettings(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(settings));
    } catch {}
  }, [settings, hydrated, email]);

  // On connect: adopt remote settings only if the user hasn't changed anything
  // locally this session; otherwise push the local change up.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    (async () => {
      const remote = await fetchSettings(email);
      if (cancelled) return;
      if (dirtyRef.current || !remote) {
        await saveSettings(email, settings);
      } else {
        setSettings(remote);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  const update = useCallback(
    (patch: Partial<InventorySettings>) => {
      dirtyRef.current = true;
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (canSync && email) saveSettings(email, next).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  return { settings, update, hydrated };
}
