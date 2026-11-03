"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchSettings, saveSettings } from "@/features/inventory/data/inventoryData";
import {
  DEFAULT_INVENTORY_SETTINGS,
  normalizeSettings,
  type InventorySettings,
} from "@/features/inventory/lib/types";
import { durableSave, pendingUpsertIds } from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";

const STORAGE_KEY = "bookmarkdeck:inventory:settings:v1";
// A local change not yet in the cloud is queued under this one id — it outlives a
// reload, where the in-memory flag it replaces did not.
const DOMAIN = "inventorySettings";
const ID = "settings";

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
  // WHICH account's cache has loaded, not just whether one has. In the render
  // where the email arrives the state in hand is still the signed-out key's:
  // writing it then put that list over the account's cache, and a connect in the
  // same commit replayed from the clobbered copy and dropped what was queued.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const hydrated = loadedFor === (email ?? "");
  const canSync = connected && Boolean(email);

  useEffect(() => {
    setSettings(loadLocal(email));
    setLoadedFor(email ?? "");
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(settings));
    } catch {}
  }, [settings, hydrated, email]);

  // On connect: adopt remote settings unless a local change is still waiting to
  // reach the cloud (queued), in which case push the device's copy up.
  useEffect(() => {
    if (!canSync || !email || !hydrated) return;
    let cancelled = false;
    (async () => {
      const remote = await untilAnswered(() => fetchSettings(email), () => cancelled);
      if (cancelled) return;
      if (pendingUpsertIds(DOMAIN, email).has(ID) || !remote) {
        const local = loadLocal(email);
        await durableSave(DOMAIN, email, ID, () => saveSettings(email, local));
      } else {
        setSettings(remote);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email, hydrated]);

  const update = useCallback(
    (patch: Partial<InventorySettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        durableSave(DOMAIN, email, ID, canSync && email ? () => saveSettings(email, next) : null).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  return { settings, update, hydrated };
}
