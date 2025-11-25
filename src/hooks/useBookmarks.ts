//src/hooks/useBookmarks.ts
"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "@/types/bookmark";
import {
  downloadBookmarksFromDrive,
  uploadBookmarksToDrive,
} from "@/utils/googleDriveSync";

const STORAGE_KEY = "bookmarkdeck:v1";

function normalizeBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object"
    )
    .map((item): Bookmark => {
      const tags = Array.isArray(item.tags)
        ? item.tags.map((tag) => String(tag)).filter(Boolean)
        : [];

      return {
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        title:
          (typeof item.title === "string" && item.title) ||
          (typeof item.url === "string" && item.url) ||
          "Untitled",
        url: typeof item.url === "string" ? item.url : "",
        note: typeof item.note === "string" ? item.note : "",
        folder: typeof item.folder === "string" ? item.folder : undefined,
        createdAt:
          typeof item.createdAt === "string"
            ? item.createdAt
            : new Date().toISOString(),
        tags,
        pinned: typeof item.pinned === "boolean" ? item.pinned : false,
      };
    });
}

function loadFromStorage(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeBookmarks(parsed);
  } catch {
    return [];
  }
}

function saveToStorage(bookmarks: Bookmark[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

type AddBookmarkInput = Omit<Bookmark, "id" | "createdAt">;

export function useBookmarks() {
  // Start empty on the server and hydrate from localStorage client-side to avoid
  // SSR/client mismatches.
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadFromStorage();
    setBookmarks(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(bookmarks);
  }, [bookmarks, hydrated]);

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

  const syncFromCloud = async (passphrase: string) => {
    if (!passphrase.trim()) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const remote = await downloadBookmarksFromDrive(passphrase.trim());
      if (remote && Array.isArray(remote.bookmarks)) {
        setBookmarks(remote.bookmarks);
        saveToStorage(remote.bookmarks);
        setLastSyncedAt(remote.modifiedAt ?? new Date().toISOString());
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to sync from Google Drive."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToCloud = async (passphrase: string) => {
    if (!passphrase.trim()) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await uploadBookmarksToDrive(passphrase.trim(), bookmarks);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to sync to Google Drive."
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
  };
}
