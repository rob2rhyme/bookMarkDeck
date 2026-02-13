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
type SyncReason = "auto" | "manual";
type SyncOptions = {
  silent?: boolean;
  reason?: SyncReason;
  ignoreConflict?: boolean;
};
type BookmarkDeckSyncMeta = {
  lastSyncedAt: string | null;
  localUpdatedAt: string | null;
};
type BookmarkSyncConflict = {
  remoteBookmarks: Bookmark[];
  remoteFolders: Folder[];
  remoteUpdatedAt: string | null;
  localUpdatedAt: string | null;
  lastSyncedAt: string | null;
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

function syncMetaKeyForUser(userId?: string | null): string {
  return userId
    ? `bookmarkDeck.sync.meta:${userId}`
    : "bookmarkDeck.sync.meta:guest";
}

function localSnapshotKeyForUser(userId?: string | null): string {
  return userId
    ? `bookmarkDeck.local.snapshots:${userId}`
    : "bookmarkDeck.local.snapshots:guest";
}

function migrateStorageKeyOnce(
  toIdentity: string | null | undefined,
  fromIdentity: string | null | undefined,
  keyBuilder: (identity?: string | null) => string
): void {
  if (typeof window === "undefined") return;
  if (!toIdentity || !fromIdentity || toIdentity === fromIdentity) return;
  const toKey = keyBuilder(toIdentity);
  const fromKey = keyBuilder(fromIdentity);
  const hasTo = window.localStorage.getItem(toKey);
  if (hasTo !== null) return;
  const fromRaw = window.localStorage.getItem(fromKey);
  if (fromRaw === null) return;
  window.localStorage.setItem(toKey, fromRaw);
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

function backfillBookmarkFolderIds(
  bookmarksInput: Bookmark[],
  foldersInput: Folder[]
): Bookmark[] {
  const rootFoldersByNameKey = new Map<string, Folder>();
  foldersInput.forEach((folder) => {
    if (folder.parentId !== null) return;
    const key = folderNameKey(folder.name);
    if (!rootFoldersByNameKey.has(key)) {
      rootFoldersByNameKey.set(key, folder);
    }
  });

  return bookmarksInput.map((bookmark) => {
    if (typeof bookmark.folderId === "string") {
      const exists = foldersInput.some((folder) => folder.id === bookmark.folderId);
      if (exists) return bookmark;
    }
    const legacyLabel = normalizeFolderName(bookmark.folder ?? "");
    if (!legacyLabel) {
      return { ...bookmark, folderId: null };
    }
    const folder = rootFoldersByNameKey.get(folderNameKey(legacyLabel));
    return {
      ...bookmark,
      folder: legacyLabel,
      folderId: folder?.id ?? null,
    };
  });
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
        return {
          version: 2,
          bookmarks: backfillBookmarkFolderIds(bookmarks, folders),
          folders,
        };
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
  window.localStorage.removeItem(legacyLocalFoldersKey(userId));
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

function loadSyncMeta(userId?: string | null): BookmarkDeckSyncMeta {
  if (typeof window === "undefined") {
    return { lastSyncedAt: null, localUpdatedAt: null };
  }
  try {
    const raw = window.localStorage.getItem(syncMetaKeyForUser(userId));
    if (!raw) return { lastSyncedAt: null, localUpdatedAt: null };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      localUpdatedAt:
        typeof parsed.localUpdatedAt === "string" ? parsed.localUpdatedAt : null,
    };
  } catch {
    return { lastSyncedAt: null, localUpdatedAt: null };
  }
}

function saveSyncMeta(
  userId: string | null | undefined,
  meta: BookmarkDeckSyncMeta
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(syncMetaKeyForUser(userId), JSON.stringify(meta));
}

function toMillis(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function signatureForState(bookmarks: Bookmark[], folders: Folder[]): string {
  const bookmarkShape = [...bookmarks]
    .map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      note: bookmark.note ?? "",
      folderId:
        typeof bookmark.folderId === "string"
          ? bookmark.folderId
          : bookmark.folderId === null
            ? null
            : undefined,
      tags: [...(bookmark.tags ?? [])].sort(),
      pinned: !!bookmark.pinned,
      hits: bookmark.hits ?? 0,
      lastUsedAt: bookmark.lastUsedAt ?? "",
      createdAt: bookmark.createdAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const folderShape = [...folders]
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      sortOrder: folder.sortOrder ?? 0,
      updatedAt: folder.updatedAt ?? "",
      createdAt: folder.createdAt ?? "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ bookmarkShape, folderShape });
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

export function useBookmarks(
  userId?: string | null,
  userStorageKey?: string | null
) {
  const storageIdentity = userStorageKey ?? userId;
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(null);
  const [syncConflict, setSyncConflict] = useState<BookmarkSyncConflict | null>(null);
  const [backups, setBackups] = useState<FirestoreBookmarkBackup[]>([]);
  const [areBackupsLoading, setAreBackupsLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    migrateStorageKeyOnce(storageIdentity, userId, storageKeyV2ForUser);
    migrateStorageKeyOnce(storageIdentity, userId, storageKeyV1ForUser);
    migrateStorageKeyOnce(storageIdentity, userId, legacyLocalFoldersKey);
    migrateStorageKeyOnce(storageIdentity, userId, syncMetaKeyForUser);
    migrateStorageKeyOnce(storageIdentity, userId, localSnapshotKeyForUser);
    const stored = loadFromStorage(storageIdentity);
    const syncMeta = loadSyncMeta(storageIdentity);
    setBookmarks(stored.bookmarks);
    setFolders(stored.folders);
    setLastSyncedAt(syncMeta.lastSyncedAt);
    setLocalUpdatedAt(syncMeta.localUpdatedAt);
    setSyncConflict(null);
    setHydrated(true);
    return () => {
      setBookmarks([]);
      setFolders([]);
      setHydrated(false);
      setLastSyncedAt(null);
      setLocalUpdatedAt(null);
      setSyncConflict(null);
    };
  }, [storageIdentity, userId]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(bookmarks, folders, storageIdentity);
  }, [bookmarks, folders, hydrated, storageIdentity]);

  useEffect(() => {
    if (!hydrated) return;
    saveSyncMeta(storageIdentity, { lastSyncedAt, localUpdatedAt });
  }, [hydrated, lastSyncedAt, localUpdatedAt, storageIdentity]);

  const markLocalUpdated = () => {
    setLocalUpdatedAt(new Date().toISOString());
  };

  const recordLocalSnapshot = (
    reason:
      | "pre-sync-overwrite"
      | "pre-sync-conflict-manual"
      | "pre-push-overwrite"
      | "pre-push-conflict-manual"
      | "manual-resolution-use-cloud"
      | "manual-resolution-keep-local"
  ) => {
    if (typeof window === "undefined") return;
    const key = localSnapshotKeyForUser(storageIdentity);
    const nextSnapshot = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      bookmarks,
      folders,
      lastSyncedAt,
      localUpdatedAt,
    };
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const snapshots = Array.isArray(parsed) ? parsed : [];
      const merged = [nextSnapshot, ...snapshots].slice(0, 8);
      window.localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      window.localStorage.setItem(key, JSON.stringify([nextSnapshot]));
    }
  };

  const applyRemoteState = (
    remoteBookmarks: Bookmark[],
    remoteFolders: Folder[],
    remoteUpdatedAt?: string
  ) => {
    setBookmarks(remoteBookmarks);
    setFolders(remoteFolders);
    saveToStorage(remoteBookmarks, remoteFolders, storageIdentity);
    const syncedAt = remoteUpdatedAt ?? new Date().toISOString();
    setLastSyncedAt(syncedAt);
    setLocalUpdatedAt(syncedAt);
    setSyncConflict(null);
  };

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
    markLocalUpdated();
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
    markLocalUpdated();
  };

  const deleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id));
    markLocalUpdated();
  };

  const clearAll = () => {
    setBookmarks([]);
    markLocalUpdated();
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
    markLocalUpdated();
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
    markLocalUpdated();

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
    markLocalUpdated();
    return { ok: true };
  };

  const syncFromCloud = async (
    userIdHint: string | null | undefined,
    options?: SyncOptions
  ) => {
    const silent = options?.silent ?? false;
    const reason = options?.reason ?? "manual";
    const ignoreConflict = options?.ignoreConflict ?? false;
    if (!userIdHint) {
      if (!silent) setSyncError("Sign in to sync your bookmarks.");
      return;
    }
    setIsSyncing(true);
    if (!silent) setSyncError(null);
    try {
      const remote = await fetchBookmarks(userIdHint);
      if (!remote || !Array.isArray(remote.bookmarks)) {
        if (!silent) setSyncError("No cloud backup found.");
        return;
      }
      const normalizedBookmarks = normalizeBookmarks(remote.bookmarks);
      const normalizedFolders = normalizeFolders(remote.folders);
      const nextState =
        normalizedFolders.length > 0
          ? {
              bookmarks: backfillBookmarkFolderIds(
                normalizedBookmarks,
                normalizedFolders
              ),
              folders: normalizedFolders,
            }
          : migrateLegacyData(normalizedBookmarks);
      const remoteIsEmpty =
        nextState.bookmarks.length === 0 &&
        (nextState.folders?.length ?? 0) === 0;
      const localHasData = bookmarks.length > 0 || folders.length > 0;

      const localHasUnsyncedChanges =
        toMillis(localUpdatedAt) > toMillis(lastSyncedAt);
      const remoteIsNewerThanLastSync =
        toMillis(remote.updatedAt) > toMillis(lastSyncedAt);
      const signaturesDiffer =
        signatureForState(bookmarks, folders) !==
        signatureForState(nextState.bookmarks, nextState.folders);
      const hasConflict =
        localHasUnsyncedChanges && remoteIsNewerThanLastSync && signaturesDiffer;
      const hasEmptyRemoteConflict = remoteIsEmpty && localHasData;

      if ((hasConflict || hasEmptyRemoteConflict) && !ignoreConflict) {
        if (reason === "manual" && !silent) {
          recordLocalSnapshot("pre-sync-conflict-manual");
          setSyncConflict({
            remoteBookmarks: nextState.bookmarks,
            remoteFolders: nextState.folders,
            remoteUpdatedAt: remote.updatedAt ?? null,
            localUpdatedAt,
            lastSyncedAt,
          });
          return;
        }
        // Auto mode is cloud-authoritative; keep a local safety snapshot first.
        recordLocalSnapshot("pre-sync-overwrite");
      }

      applyRemoteState(nextState.bookmarks, nextState.folders, remote.updatedAt);
      await refreshBackups(userIdHint);
    } catch (err) {
      if (!silent) {
        setSyncError(
          err instanceof Error ? err.message : "Failed to sync from cloud."
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToCloud = async (
    userIdHint: string | null | undefined,
    shortcuts?: ShortcutApp[],
    options?: SyncOptions
  ) => {
    const silent = options?.silent ?? false;
    const ignoreConflict = options?.ignoreConflict ?? false;
    if (!userIdHint) {
      if (!silent) setSyncError("Sign in to sync your bookmarks.");
      return;
    }
    setIsSyncing(true);
    if (!silent) setSyncError(null);
    try {
      if (!ignoreConflict) {
        const remote = await fetchBookmarks(userIdHint);
        const normalizedBookmarks = normalizeBookmarks(remote.bookmarks);
        const normalizedFolders = normalizeFolders(remote.folders);
        const remoteState =
          normalizedFolders.length > 0
            ? {
                bookmarks: backfillBookmarkFolderIds(
                  normalizedBookmarks,
                  normalizedFolders
                ),
                folders: normalizedFolders,
              }
            : migrateLegacyData(normalizedBookmarks);
        const localHasUnsyncedChanges =
          toMillis(localUpdatedAt) > toMillis(lastSyncedAt);
        const remoteIsNewerThanLastSync =
          toMillis(remote.updatedAt) > toMillis(lastSyncedAt);
        const signaturesDiffer =
          signatureForState(bookmarks, folders) !==
          signatureForState(remoteState.bookmarks, remoteState.folders);
        const hasConflict =
          localHasUnsyncedChanges && remoteIsNewerThanLastSync && signaturesDiffer;
        if (hasConflict && !silent) {
          recordLocalSnapshot("pre-push-conflict-manual");
          setSyncConflict({
            remoteBookmarks: remoteState.bookmarks,
            remoteFolders: remoteState.folders,
            remoteUpdatedAt: remote.updatedAt ?? null,
            localUpdatedAt,
            lastSyncedAt,
          });
          return;
        }
      } else {
        recordLocalSnapshot("pre-push-overwrite");
      }
      await saveBookmarks(userIdHint, bookmarks, folders, shortcuts);
      const syncedAt = new Date().toISOString();
      setLastSyncedAt(syncedAt);
      setLocalUpdatedAt(syncedAt);
      setSyncConflict(null);
    } catch (err) {
      if (!silent) {
        setSyncError(
          err instanceof Error ? err.message : "Failed to sync to cloud."
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const resolveSyncConflictUseCloud = async (
    userIdHint: string | null | undefined
  ) => {
    if (!syncConflict || !userIdHint) return;
    recordLocalSnapshot("manual-resolution-use-cloud");
    applyRemoteState(
      syncConflict.remoteBookmarks,
      syncConflict.remoteFolders,
      syncConflict.remoteUpdatedAt ?? undefined
    );
    await refreshBackups(userIdHint);
  };

  const resolveSyncConflictKeepLocal = async (
    userIdHint: string | null | undefined,
    shortcuts?: ShortcutApp[]
  ) => {
    if (!syncConflict) return;
    recordLocalSnapshot("manual-resolution-keep-local");
    setSyncConflict(null);
    await syncToCloud(userIdHint, shortcuts, {
      reason: "manual",
      silent: false,
      ignoreConflict: true,
    });
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
    markLocalUpdated();
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
    localUpdatedAt,
    syncConflict,
    resolveSyncConflictUseCloud,
    resolveSyncConflictKeepLocal,
    refreshBackups,
    backups,
    areBackupsLoading,
    backupError,
  };
}

export { folderNameKey, normalizeFolderName, migrateLegacyData };
