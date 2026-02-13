"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "@/types/bookmark";
import { Folder } from "@/types/folder";
import {
  fetchBookmarkBackups,
  fetchBookmarks,
  saveBookmarks,
  type FirestoreBookmarkBackup,
} from "@/utils/firestoreBookmarks";
import { ShortcutApp } from "@/types/shortcut";

const BASE_STORAGE_KEY_V1 = "bookmarkdeck:v1";
const BASE_STORAGE_KEY_V2 = "bookmarkdeck:v2";

type BookmarkDeckStorageV2 = {
  version: 2;
  bookmarks: Bookmark[];
  folders: Folder[];
};

type AddBookmarkInput = Omit<Bookmark, "id" | "createdAt">;
type AddFolderInput = {
  name: string;
  parentId?: string | null;
};

function normalizeFolderName(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function folderNameKey(value: string): string {
  return value.trim().toLowerCase();
}

function storageKeyV1ForUser(userId?: string | null): string {
  return userId ? `${BASE_STORAGE_KEY_V1}:${userId}` : BASE_STORAGE_KEY_V1;
}

function storageKeyV2ForUser(userId?: string | null): string {
  return userId ? `${BASE_STORAGE_KEY_V2}:${userId}` : BASE_STORAGE_KEY_V2;
}

function legacyLocalFoldersKey(userId?: string | null): string {
  return userId
    ? `bookmarkDeck.folders.local:${userId}`
    : "bookmarkDeck.folders.local:guest";
}

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
      const icon =
        typeof record.icon === "string" && record.icon.trim()
          ? record.icon.trim()
          : undefined;

      const folderValue =
        typeof record.folder === "string" ? normalizeFolderName(record.folder) : null;
      const folderIdValue = record.folderId;
      const hitsValue = record.hits;
      const lastUsedAtValue = record.lastUsedAt;

      return {
        id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
        title:
          (typeof record.title === "string" && record.title) ||
          (typeof record.url === "string" && record.url) ||
          "Untitled",
        url: typeof record.url === "string" ? record.url : "",
        icon,
        note: typeof record.note === "string" ? record.note : "",
        folderId:
          typeof folderIdValue === "string"
            ? folderIdValue
            : folderIdValue === null
              ? null
              : undefined,
        folder: folderValue ?? undefined,
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

function normalizeFolders(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object"
    )
    .map((item): Folder | null => {
      const record = item as Record<string, unknown>;
      const normalizedName =
        typeof record.name === "string" ? normalizeFolderName(record.name) : null;
      if (!normalizedName) return null;

      const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
      const parentId =
        typeof record.parentId === "string"
          ? record.parentId
          : record.parentId === null
            ? null
            : null;

      const folder: Folder = {
        id,
        name: normalizedName,
        parentId,
      };

      if (typeof record.sortOrder === "number") folder.sortOrder = record.sortOrder;
      if (typeof record.createdAt === "string") folder.createdAt = record.createdAt;
      if (typeof record.updatedAt === "string") folder.updatedAt = record.updatedAt;

      return folder;
    })
    .filter((folder): folder is Folder => Boolean(folder));
}

function readLegacyLocalFolders(userId?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(legacyLocalFoldersKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const labels: string[] = [];

    parsed.forEach((value) => {
      const normalized = typeof value === "string" ? normalizeFolderName(value) : null;
      if (!normalized) return;
      const key = folderNameKey(normalized);
      if (seen.has(key)) return;
      seen.add(key);
      labels.push(normalized);
    });

    return labels;
  } catch {
    return [];
  }
}

function migrateLegacyData(
  bookmarksInput: Bookmark[],
  legacyFolderLabels: string[] = []
): { bookmarks: Bookmark[]; folders: Folder[] } {
  const folders: Folder[] = [];
  const folderByKey = new Map<string, Folder>();

  const ensureRootFolder = (name: string): Folder => {
    const key = folderNameKey(name);
    const existing = folderByKey.get(key);
    if (existing) return existing;

    const now = new Date().toISOString();
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      parentId: null,
      createdAt: now,
      updatedAt: now,
    };

    folderByKey.set(key, folder);
    folders.push(folder);
    return folder;
  };

  bookmarksInput.forEach((bookmark) => {
    const legacyLabel = normalizeFolderName(bookmark.folder ?? "");
    if (!legacyLabel) return;
    ensureRootFolder(legacyLabel);
  });

  legacyFolderLabels.forEach((label) => {
    const normalized = normalizeFolderName(label);
    if (!normalized) return;
    ensureRootFolder(normalized);
  });

  const migratedBookmarks = bookmarksInput.map((bookmark) => {
    if (typeof bookmark.folderId === "string") {
      return { ...bookmark, folderId: bookmark.folderId };
    }

    const legacyLabel = normalizeFolderName(bookmark.folder ?? "");
    if (!legacyLabel) {
      return { ...bookmark, folderId: null };
    }

    const mapped = folderByKey.get(folderNameKey(legacyLabel));
    return {
      ...bookmark,
      folder: legacyLabel,
      folderId: mapped?.id ?? null,
    };
  });

  return { bookmarks: migratedBookmarks, folders };
}

function loadFromStorage(userId?: string | null): BookmarkDeckStorageV2 {
  if (typeof window === "undefined") return { version: 2, bookmarks: [], folders: [] };

  try {
    const rawV2 = window.localStorage.getItem(storageKeyV2ForUser(userId));
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Record<string, unknown>;
      const bookmarks = normalizeBookmarks(parsed.bookmarks);
      const folders = normalizeFolders(parsed.folders);
      if (parsed.version === 2) {
        return { version: 2, bookmarks, folders };
      }
    }
  } catch {
    // fall through to v1 migration
  }

  const bookmarksV1 = (() => {
    try {
      const raw = window.localStorage.getItem(storageKeyV1ForUser(userId));
      if (!raw) return [];
      return normalizeBookmarks(JSON.parse(raw));
    } catch {
      return [];
    }
  })();

  const legacyFolders = readLegacyLocalFolders(userId);
  const migrated = migrateLegacyData(bookmarksV1, legacyFolders);
  const payload: BookmarkDeckStorageV2 = {
    version: 2,
    bookmarks: migrated.bookmarks,
    folders: migrated.folders,
  };

  window.localStorage.setItem(storageKeyV2ForUser(userId), JSON.stringify(payload));
  return payload;
}

function saveToStorage(
  bookmarks: Bookmark[],
  folders: Folder[],
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  const payload: BookmarkDeckStorageV2 = {
    version: 2,
    bookmarks,
    folders,
  };
  window.localStorage.setItem(storageKeyV2ForUser(userId), JSON.stringify(payload));
}

function wouldCreateCycle(
  folders: Folder[],
  folderId: string,
  nextParentId: string | null
): boolean {
  if (!nextParentId) return false;
  if (folderId === nextParentId) return true;

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>([folderId]);

  let cursor: string | null = nextParentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);

    const node = byId.get(cursor);
    if (!node) return false;
    cursor = node.parentId;
  }

  return false;
}

export function useBookmarks(userId?: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [backups, setBackups] = useState<FirestoreBookmarkBackup[]>([]);
  const [areBackupsLoading, setAreBackupsLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadFromStorage(userId);
    setBookmarks(stored.bookmarks);
    setFolders(stored.folders);
    setHydrated(true);
    return () => {
      setBookmarks([]);
      setFolders([]);
      setHydrated(false);
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(bookmarks, folders, userId);
  }, [bookmarks, folders, hydrated, userId]);

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
      folderId:
        typeof partial.folderId === "string"
          ? partial.folderId
          : partial.folderId === null
            ? null
            : null,
      tags: partial.tags ?? [],
      pinned: partial.pinned ?? false,
    };
    setBookmarks((prev) => [newBookmark, ...prev]);
  };

  const updateBookmark = (id: string, data: Partial<Bookmark>) => {
    setBookmarks((prev) =>
      prev.map((bookmark) => {
        if (bookmark.id !== id) return bookmark;

        const next: Bookmark = {
          ...bookmark,
          ...data,
          tags: data.tags
            ? data.tags.map((tag) => tag.trim()).filter(Boolean)
            : bookmark.tags,
          pinned:
            typeof data.pinned === "boolean" ? data.pinned : bookmark.pinned,
        };

        if (Object.prototype.hasOwnProperty.call(data, "folderId")) {
          next.folderId =
            typeof data.folderId === "string"
              ? data.folderId
              : data.folderId === null
                ? null
                : null;
        }

        return next;
      })
    );
  };

  const deleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id));
  };

  const clearAll = () => {
    setBookmarks([]);
  };

  const addFolder = ({ name, parentId = null }: AddFolderInput): Folder | null => {
    const normalizedName = normalizeFolderName(name);
    if (!normalizedName) return null;

    const parentKey = parentId ?? null;
    const siblingExists = folders.some(
      (folder) =>
        folder.parentId === parentKey &&
        folderNameKey(folder.name) === folderNameKey(normalizedName)
    );
    if (siblingExists) return null;

    const now = new Date().toISOString();
    const folder: Folder = {
      id: crypto.randomUUID(),
      name: normalizedName,
      parentId: parentKey,
      createdAt: now,
      updatedAt: now,
    };

    setFolders((prev) => [...prev, folder]);
    return folder;
  };

  const updateFolder = (
    id: string,
    data: Partial<Pick<Folder, "name" | "parentId" | "sortOrder">>
  ): { ok: true } | { ok: false; reason: string } => {
    const folder = folders.find((value) => value.id === id);
    if (!folder) return { ok: false, reason: "Folder not found." };

    const nextName =
      typeof data.name === "string" ? normalizeFolderName(data.name) : folder.name;
    if (!nextName) return { ok: false, reason: "Folder name is required." };

    const nextParentId =
      data.parentId === undefined
        ? folder.parentId
        : data.parentId === null
          ? null
          : data.parentId;

    const siblingExists = folders.some(
      (value) =>
        value.id !== id &&
        value.parentId === nextParentId &&
        folderNameKey(value.name) === folderNameKey(nextName)
    );
    if (siblingExists) {
      return { ok: false, reason: "A folder with this name already exists here." };
    }

    if (wouldCreateCycle(folders, id, nextParentId)) {
      return { ok: false, reason: "Cannot move a folder into itself or its descendant." };
    }

    setFolders((prev) =>
      prev.map((value) =>
        value.id === id
          ? {
              ...value,
              name: nextName,
              parentId: nextParentId,
              sortOrder:
                typeof data.sortOrder === "number" ? data.sortOrder : value.sortOrder,
              updatedAt: new Date().toISOString(),
            }
          : value
      )
    );

    return { ok: true };
  };

  const deleteFolder = (
    folderId: string
  ): { ok: true } | { ok: false; reason: string } => {
    const hasChildren = folders.some((folder) => folder.parentId === folderId);
    if (hasChildren) {
      return { ok: false, reason: "This folder has subfolders." };
    }

    setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
    setBookmarks((prev) =>
      prev.map((bookmark) =>
        bookmark.folderId === folderId ? { ...bookmark, folderId: null } : bookmark
      )
    );
    return { ok: true };
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
      const migrated = migrateLegacyData(normalized);
      setBookmarks(migrated.bookmarks);
      setFolders(migrated.folders);
      saveToStorage(migrated.bookmarks, migrated.folders, userIdHint);
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

  const restoreFromSnapshot = (snapshot: Bookmark[]) => {
    setBookmarks(
      normalizeBookmarks(
        snapshot.map((bookmark) => ({
          ...bookmark,
          pinned: typeof bookmark.pinned === "boolean" ? bookmark.pinned : false,
        }))
      )
    );
  };

  return {
    bookmarks,
    folders,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    restoreFromSnapshot,
    addFolder,
    updateFolder,
    deleteFolder,
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

export { folderNameKey, normalizeFolderName, migrateLegacyData };
