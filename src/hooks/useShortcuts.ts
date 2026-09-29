//src/hooks/useShortcuts.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { ShortcutApp } from "@/types/shortcut";
import {
  fetchShortcuts,
  saveShortcuts,
  FirestoreShortcutsPayload,
} from "@/utils/firestoreShortcuts";
import {
  clearPendingDeletes,
  pendingDeleteIds,
  queueDelete,
  unqueueDelete,
} from "@/utils/pendingDeletes";

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

  // What was last adopted from another tab, so it isn't written straight back.
  const adopted = useRef<ShortcutApp[] | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (adopted.current === shortcuts) return;
    saveToStorage(shortcuts, userId);
  }, [shortcuts, hydrated, userId]);

  // Adopt another tab's write, or this tab's next change puts back its stale
  // copy — see the same listener in useBookmarks for the full reasoning.
  useEffect(() => {
    if (!hydrated) return;
    const key = storageKeyForUser(userId);
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key) return;
      if (!event.newValue) return; // never wipe state from an event
      let next: ShortcutApp[];
      try {
        next = normalizeShortcuts(JSON.parse(event.newValue));
      } catch {
        return;
      }
      adopted.current = next;
      setShortcuts(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated, userId]);

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
    // Remember the deletion so a later sync-from-cloud can't resurrect it
    // before the deletion is pushed back to the cloud.
    queueDelete("shortcuts", userId, id);
  };

  const restoreFromSnapshot = (snapshot: ShortcutApp[]) => {
    const restored = normalizeShortcuts(snapshot);
    restored.forEach((s) => unqueueDelete("shortcuts", userId, s.id));
    setShortcuts(restored);
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
      if (normalized.length === 0 && shortcuts.length > 0) {
        setLastSyncedAt(remote.updatedAt ?? new Date().toISOString());
        return;
      }
      // Remote is authoritative; keep any local-only shortcuts not yet in the
      // cloud, but drop anything deleted locally and not yet pushed so the pull
      // can't resurrect it.
      const pending = pendingDeleteIds("shortcuts", userId);
      const merged: ShortcutApp[] = [];
      const seenIds = new Set<string>();
      normalized.forEach((item) => {
        if (seenIds.has(item.id) || pending.has(item.id)) return;
        seenIds.add(item.id);
        merged.push(item);
      });
      shortcuts.forEach((item) => {
        if (!seenIds.has(item.id) && !pending.has(item.id)) {
          seenIds.add(item.id);
          merged.push(item);
        }
      });
      setShortcuts(merged);
      saveToStorage(merged, userIdHint);
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
      // The pushed array already omits deleted shortcuts — the cloud now
      // matches local, so the pending-deletes queue can be cleared.
      clearPendingDeletes("shortcuts", userId);
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
