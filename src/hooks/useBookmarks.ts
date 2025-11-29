//src/hooks/useBookmarks.ts
"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "@/types/bookmark";
import {
  fetchBookmarkBackups,
  fetchBookmarks,
  saveBookmarks,
  type FirestoreBookmarkBackup,
} from "@/utils/firestoreBookmarks";
import { ShortcutApp } from "@/types/shortcut";

const BASE_STORAGE_KEY = "bookmarkdeck:v1";

function normalizeBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object"
    )
    .map((item): Bookmark => {
      const record = item as Record<string, unknown>;
      const tags = Array.isArray(record.tags)
        ? record.tags.map((tag) => String(tag)).filter(Boolean)
        : [];

      const hitsValue = record.hits;
      const lastUsedAtValue = record.lastUsedAt;

      return {
        id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
        title:
          (typeof record.title === "string" && record.title) ||
          (typeof record.url === "string" && record.url) ||
          "Untitled",
        url: typeof record.url === "string" ? record.url : "",
        note: typeof record.note === "string" ? record.note : "",
        folder:
          typeof record.folder === "string" ? record.folder : undefined,
        createdAt:
          typeof record.createdAt === "string"
            ? record.createdAt
            : new Date().toISOString(),
        tags,
        pinned: typeof record.pinned === "boolean" ? record.pinned : false,
        hits: typeof hitsValue === "number" ? hitsValue : 0,
        lastUsedAt:
          typeof lastUsedAtValue === "string" ? lastUsedAtValue : undefined,
      };
    });
}

function storageKeyForUser(userId?: string | null) {
  return userId ? `${BASE_STORAGE_KEY}:${userId}` : BASE_STORAGE_KEY;
}

function loadFromStorage(userId?: string | null): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKeyForUser(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeBookmarks(parsed);
  } catch {
    return [];
  }
}

function saveToStorage(bookmarks: Bookmark[], userId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKeyForUser(userId), JSON.stringify(bookmarks));
}

type AddBookmarkInput = Omit<Bookmark, "id" | "createdAt">;

export function useBookmarks(userId?: string | null) {
  // Start empty on the server and hydrate from localStorage client-side to avoid
  // SSR/client mismatches.
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [backups, setBackups] = useState<FirestoreBookmarkBackup[]>([]);
  const [areBackupsLoading, setAreBackupsLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadFromStorage(userId);
    setBookmarks(stored);
    setHydrated(true);
    // Reset state when user changes
    return () => {
      setBookmarks([]);
      setHydrated(false);
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(bookmarks, userId);
  }, [bookmarks, hydrated, userId]);

  const refreshBackups = async (userIdHint: string | null | undefined) => {
    if (!userIdHint) {
      setBackups([]);
      setBackupError(null);
      return;
    }
    setAreBackupsLoading(true);
    setBackupError(null);
    try {
      const remoteBackups = await fetchBookmarkBackups(userIdHint);
      setBackups(remoteBackups);
    } catch (err) {
      console.error(err);
      setBackupError(
        err instanceof Error
          ? err.message
          : "Unable to load backups (permission or network issue)."
      );
    } finally {
      setAreBackupsLoading(false);
    }
  };

  const addBookmark = (partial: AddBookmarkInput) => {
    const newBookmark: Bookmark = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      tags: partial.tags ?? [],
      pinned: partial.pinned ?? false,
    };
    setBookmarks((prev) => [newBookmark, ...prev]);
  };

  const updateBookmark = (id: string, data: Partial<Bookmark>) => {
    setBookmarks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              ...data,
              tags: data.tags
                ? data.tags.map((t) => t.trim()).filter(Boolean)
                : b.tags,
                pinned:
                typeof data.pinned === "boolean" ? data.pinned : b.pinned,
            }
          : b
      )
    );
  };

  const deleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const clearAll = () => {
    setBookmarks([]);
  };

  const syncFromCloud = async (userIdHint: string | null | undefined) => {
    if (!userIdHint) {
      setSyncError("Sign in to sync your bookmarks.");
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const remote = await fetchBookmarks(userIdHint);
      if (!remote || !Array.isArray(remote.bookmarks)) {
        setSyncError("No cloud backup found.");
        return;
      }
      const normalized = normalizeBookmarks(remote.bookmarks);
      setBookmarks(normalized);
      saveToStorage(normalized, userIdHint);
      setLastSyncedAt(remote.updatedAt ?? new Date().toISOString());
      await refreshBackups(userIdHint);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to sync from cloud."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToCloud = async (
    userIdHint: string | null | undefined,
    shortcuts?: ShortcutApp[]
  ) => {
    if (!userIdHint) {
      setSyncError("Sign in to sync your bookmarks.");
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      await saveBookmarks(userIdHint, bookmarks, shortcuts);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to sync to cloud."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Restore an exact previous list of bookmarks (used for Undo)
  const restoreFromSnapshot = (snapshot: Bookmark[]) => {
    setBookmarks(
      normalizeBookmarks(
        snapshot.map((b) => ({
          ...b,
          pinned: typeof b.pinned === "boolean" ? b.pinned : false,
        }))
      )
    );
  };

  return {
    bookmarks,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    restoreFromSnapshot,
    syncFromCloud,
    syncToCloud,
    isSyncing,
    syncError,
    lastSyncedAt,
    refreshBackups,
    backups,
    areBackupsLoading,
    backupError,
  };
}
