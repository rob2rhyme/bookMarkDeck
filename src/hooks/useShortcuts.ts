//src/hooks/useShortcuts.ts
"use client";

import { useEffect, useState } from "react";
import { ShortcutApp } from "@/types/shortcut";
import {
  fetchShortcuts,
  saveShortcuts,
  FirestoreShortcutsPayload,
} from "@/utils/firestoreShortcuts";

const BASE_STORAGE_KEY = "bookmarkdeck:shortcuts:v1";

// Start empty to mirror bookmarks behavior (blank slate on fresh devices)
const DEFAULT_SHORTCUTS: ShortcutApp[] = [];

function storageKeyForUser(userId?: string | null) {
  return userId ? `${BASE_STORAGE_KEY}:${userId}` : BASE_STORAGE_KEY;
}

function loadFromStorage(userId?: string | null): ShortcutApp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKeyForUser(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        name: typeof item.name === "string" ? item.name : "Shortcut",
        url: typeof item.url === "string" ? item.url : "",
        icon: typeof item.icon === "string" ? item.icon : undefined,
      }))
      .filter((s) => s.url.trim().length > 0);
  } catch {
    return [];
  }
}

function saveToStorage(shortcuts: ShortcutApp[], userId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKeyForUser(userId), JSON.stringify(shortcuts));
}

type AddShortcutInput = Omit<ShortcutApp, "id">;

export function useShortcuts(userId?: string | null) {
  const [shortcuts, setShortcuts] = useState<ShortcutApp[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadFromStorage(userId);
    if (stored.length > 0) {
      setShortcuts(stored);
    } else {
      setShortcuts(DEFAULT_SHORTCUTS);
    }
    setHydrated(true);
    return () => {
      setShortcuts([]);
      setHydrated(false);
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(shortcuts, userId);
  }, [shortcuts, hydrated, userId]);

  const addShortcut = (data: AddShortcutInput) => {
    const newShortcut: ShortcutApp = {
      ...data,
      id: crypto.randomUUID(),
    };
    setShortcuts((prev) => [newShortcut, ...prev]);
  };

  const updateShortcut = (id: string, data: Partial<ShortcutApp>) => {
    setShortcuts((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...data,
            }
          : s
      )
    );
  };

  const deleteShortcut = (id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  const restoreFromSnapshot = (snapshot: ShortcutApp[]) => {
    setShortcuts(snapshot);
  };

  const syncFromCloudShortcuts = async (userIdHint: string | null | undefined) => {
    if (!userIdHint) {
      setSyncError("Sign in to sync your shortcuts.");
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const remote: FirestoreShortcutsPayload = await fetchShortcuts(userIdHint);
      if (!remote || !Array.isArray(remote.shortcuts)) {
        setSyncError("No cloud shortcuts found.");
        return;
      }
      const normalized = remote.shortcuts.map((s) => ({
        ...s,
        id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
      }));
      setShortcuts(normalized);
      saveToStorage(normalized, userIdHint);
      setLastSyncedAt(remote.updatedAt ?? new Date().toISOString());
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to sync shortcuts from cloud."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToCloudShortcuts = async (userIdHint: string | null | undefined) => {
    if (!userIdHint) {
      setSyncError("Sign in to sync your shortcuts.");
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      await saveShortcuts(userIdHint, shortcuts);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to sync shortcuts to cloud."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    shortcuts,
    addShortcut,
    updateShortcut,
    deleteShortcut,
    restoreFromSnapshot,
    syncFromCloudShortcuts,
    syncToCloudShortcuts,
    isSyncing,
    syncError,
    lastSyncedAt,
  };
}
