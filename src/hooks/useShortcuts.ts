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

function normalizeShortcut(raw: unknown, fallbackId?: string): ShortcutApp | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const icon =
    typeof record.icon === "string" && record.icon.trim() ? record.icon.trim() : undefined;

  const shortcut: ShortcutApp = {
    id:
      typeof record.id === "string" && record.id.trim()
        ? record.id
        : fallbackId ?? crypto.randomUUID(),
    name: typeof record.name === "string" && record.name.trim() ? record.name : "Shortcut",
    url: typeof record.url === "string" ? record.url : "",
  };

  return icon ? { ...shortcut, icon } : shortcut;
}

function normalizeShortcuts(raw: unknown): ShortcutApp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeShortcut(item))
    .filter((shortcut): shortcut is ShortcutApp => Boolean(shortcut))
    .filter((shortcut) => shortcut.url.trim().length > 0);
}

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
    return normalizeShortcuts(parsed);
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
    const normalized = normalizeShortcut({ ...data, id: crypto.randomUUID() });
    if (!normalized) return;
    setShortcuts((prev) => [normalized, ...prev]);
  };

  const updateShortcut = (id: string, data: Partial<ShortcutApp>) => {
    setShortcuts((prev) =>
      prev.map((s) =>
        s.id === id ? normalizeShortcut({ ...s, ...data }, s.id) ?? s : s
      )
    );
  };

  const deleteShortcut = (id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  const restoreFromSnapshot = (snapshot: ShortcutApp[]) => {
    setShortcuts(normalizeShortcuts(snapshot));
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
      const normalized = normalizeShortcuts(remote.shortcuts);
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
