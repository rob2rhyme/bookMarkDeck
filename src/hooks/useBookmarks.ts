"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark } from "@/types/bookmark";
import { Folder } from "@/types/folder";
import {
  fetchBookmarkBackups,
  fetchBookmarks,
  saveBookmarks,
  type FirestoreBookmarkBackup,
} from "@/utils/firestoreBookmarks";
import {
  clearPendingDeletes,
  pendingDeleteIds,
  queueDelete,
  unqueueDelete,
} from "@/utils/pendingDeletes";
import { ShortcutApp } from "@/types/shortcut";
import { newHere, recordSyncedIds } from "@/utils/syncedIds";
import { isUnsafeUrl } from "@/utils/normalizeUrl";

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
          : typeof record.parentFolderKey === "string"
            ? record.parentFolderKey
            : record.parentId === null || record.parentFolderKey === null
            ? null
            : null;

      const folder: Folder = {
        id,
        name: normalizedName,
        parentId,
        parentFolderKey: parentId,
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
      parentFolderKey: null,
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

/** A stored v2 payload, or null — no migration, no writes. */
function parseStorageV2(raw: string): BookmarkDeckStorageV2 | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 2) return null;
    const bookmarks = normalizeBookmarks(parsed.bookmarks);
    const folders = normalizeFolders(parsed.folders);
    return {
      version: 2,
      bookmarks: backfillBookmarkFolderIds(bookmarks, folders),
      folders,
    };
  } catch {
    return null;
  }
}

function loadFromStorage(userId?: string | null): BookmarkDeckStorageV2 {
  if (typeof window === "undefined") return { version: 2, bookmarks: [], folders: [] };

  const rawV2 = window.localStorage.getItem(storageKeyV2ForUser(userId));
  const storedV2 = rawV2 ? parseStorageV2(rawV2) : null;
  if (storedV2) return storedV2;

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

/**
 * What an import would add, without touching anything. Existing bookmarks are
 * never part of the result: an import only appends.
 *
 * Each imported record keeps its own id, pin, icon, dates and usage — so
 * re-importing your own backup keeps the ids focus and filing links point at.
 * An id already taken gets a fresh one. URLs dedupe against what you have and
 * within the file.
 */
function planBookmarkImport(
  existing: Bookmark[],
  imported: unknown
): { additions: Bookmark[]; duplicate: number } {
  const urls = new Set(existing.map((b) => b.url));
  const ids = new Set(existing.map((b) => b.id));
  const additions: Bookmark[] = [];
  let duplicate = 0;
  for (const bookmark of normalizeBookmarks(imported)) {
    // A shared bookmark file can carry `javascript:`/`data:` links; never store one.
    if (!bookmark.url.trim() || isUnsafeUrl(bookmark.url)) continue;
    if (urls.has(bookmark.url)) {
      duplicate++;
      continue;
    }
    urls.add(bookmark.url);
    const id = ids.has(bookmark.id) ? crypto.randomUUID() : bookmark.id;
    ids.add(id);
    additions.push({ ...bookmark, id });
  }
  return { additions, duplicate };
}

/**
 * Merge an imported folder tree into the one you have, without duplicating it.
 * Parents are placed first. An imported folder REUSES an existing one with the
 * same id, or else a same-named sibling under the same (resolved) parent — never
 * a same-named folder somewhere else, so a nested "Clients" can't be pulled into
 * an unrelated top-level one. Otherwise it is added, keeping its id. A parent
 * that is neither in the file nor here puts the folder at the root.
 * `idMap` sends every imported id to the id it ends up with.
 */
function planFolderImport(
  existing: Folder[],
  imported: unknown
): { additions: Folder[]; idMap: Map<string, string> } {
  const incoming = normalizeFolders(imported);
  const incomingIds = new Set(incoming.map((f) => f.id));
  const pool = [...existing];
  const additions: Folder[] = [];
  const idMap = new Map<string, string>();

  const place = (f: Folder) => {
    const parentId =
      f.parentId === null
        ? null
        : (idMap.get(f.parentId) ??
          (pool.some((p) => p.id === f.parentId) ? f.parentId : null));
    if (pool.some((p) => p.id === f.id)) {
      idMap.set(f.id, f.id);
      return;
    }
    const sibling = pool.find(
      (p) => p.parentId === parentId && folderNameKey(p.name) === folderNameKey(f.name)
    );
    if (sibling) {
      idMap.set(f.id, sibling.id);
      return;
    }
    const now = new Date().toISOString();
    const added: Folder = {
      ...f,
      parentId,
      parentFolderKey: parentId,
      createdAt: f.createdAt ?? now,
      updatedAt: f.updatedAt ?? now,
    };
    pool.push(added);
    additions.push(added);
    idMap.set(f.id, f.id);
  };

  // Parents first; whatever can't be ordered (a cycle) is placed as-is.
  let pending = incoming;
  while (pending.length > 0) {
    const ready = pending.filter(
      (f) => f.parentId === null || !incomingIds.has(f.parentId) || idMap.has(f.parentId)
    );
    const batch = ready.length > 0 ? ready : pending.slice(0, 1);
    batch.forEach(place);
    pending = pending.filter((f) => !batch.includes(f));
  }
  return { additions, idMap };
}

/**
 * A backup file's contents, planned against what you have: its folder tree is
 * merged (planFolderImport) and each bookmark's folderId follows its folder to
 * wherever that landed, before the bookmarks themselves are planned.
 */
function planBackupImport(
  existingBookmarks: Bookmark[],
  existingFolders: Folder[],
  file: { bookmarks: unknown[]; folders: unknown[] }
): { additions: Bookmark[]; duplicate: number; folderAdditions: Folder[] } {
  const { additions: folderAdditions, idMap } = planFolderImport(existingFolders, file.folders);
  const remapped = file.bookmarks.map((b) => {
    const folderId = (b as { folderId?: unknown } | null)?.folderId;
    return typeof folderId === "string" && idMap.has(folderId)
      ? { ...(b as object), folderId: idMap.get(folderId) }
      : b;
  });
  return { ...planBookmarkImport(existingBookmarks, remapped), folderAdditions };
}

/**
 * The folders for a list of paths (outermost name first), found or created.
 * Each step matches a same-named child of the folder before it — reusing what
 * you have, case-insensitively — and creates what's missing, once. Matching by
 * (parent, name) rather than by name alone is what keeps a nested "Clients"
 * out of an unrelated top-level "Clients". `folderIds[i]` is where paths[i]
 * ends (null for an empty path).
 */
function planFolderPaths(
  existing: Folder[],
  paths: string[][]
): { additions: Folder[]; folderIds: (string | null)[] } {
  const pool = [...existing];
  const additions: Folder[] = [];
  const folderIds = paths.map((path) => {
    let parentId: string | null = null;
    for (const segment of path) {
      const name = normalizeFolderName(segment);
      if (!name) continue;
      const match = pool.find(
        (f) => f.parentId === parentId && folderNameKey(f.name) === folderNameKey(name)
      );
      if (match) {
        parentId = match.id;
        continue;
      }
      const now = new Date().toISOString();
      const created: Folder = {
        id: crypto.randomUUID(),
        name,
        parentId,
        parentFolderKey: parentId,
        createdAt: now,
        updatedAt: now,
      };
      pool.push(created);
      additions.push(created);
      parentId = created.id;
    }
    return parentId;
  });
  return { additions, folderIds };
}

/**
 * A browser bookmarks file, planned against what you have: links you already
 * have (by URL) are skipped first, so no folder is created just for them; the
 * rest get their folder path found or created and are filed in it.
 */
function planHtmlImport(
  existingBookmarks: Bookmark[],
  existingFolders: Folder[],
  parsed: { title: string; url: string; note: string; tags: string[]; createdAt: string; folderPath: string[] }[]
): { additions: Bookmark[]; duplicate: number; folderAdditions: Folder[] } {
  const seen = new Set(existingBookmarks.map((b) => b.url));
  const fresh = parsed.filter((p) => {
    if (!p.url.trim() || seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
  const { additions: folderAdditions, folderIds } = planFolderPaths(
    existingFolders,
    fresh.map((p) => p.folderPath)
  );
  const records = fresh.map((p, i) => ({
    title: p.title,
    url: p.url,
    note: p.note,
    tags: p.tags,
    createdAt: p.createdAt,
    folderId: folderIds[i],
    folder: p.folderPath[p.folderPath.length - 1],
  }));
  const planned = planBookmarkImport(existingBookmarks, records);
  return {
    additions: planned.additions,
    duplicate: parsed.filter((p) => p.url.trim()).length - planned.additions.length,
    folderAdditions,
  };
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

  // What was last adopted from another tab, so it isn't written straight back.
  const adopted = useRef<{ bookmarks: Bookmark[]; folders: Folder[] } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (adopted.current?.bookmarks === bookmarks && adopted.current.folders === folders) return;
    saveToStorage(bookmarks, folders, userId);
  }, [bookmarks, folders, hydrated, userId]);

  // Every open tab shares this cache. Without this, a stale tab's next write —
  // even the hit count bumped by opening a bookmark — put back its old copy and
  // erased what another tab had added; with cloud sync manual, that cache is
  // the only copy of anything not yet pushed. This ADOPTS the other tab's
  // write rather than merging: two tabs writing in the same instant still end
  // with the last one. An event never wipes state (a removed key is ignored).
  useEffect(() => {
    if (!hydrated) return;
    const key = storageKeyV2ForUser(userId);
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key) return;
      const next = event.newValue ? parseStorageV2(event.newValue) : null;
      if (!next) return;
      adopted.current = { bookmarks: next.bookmarks, folders: next.folders };
      setBookmarks(next.bookmarks);
      setFolders(next.folders);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated, userId]);

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
    queueDelete("bookmarks", userId, id);
  };

  const clearAll = () => {
    bookmarks.forEach((bookmark) => queueDelete("bookmarks", userId, bookmark.id));
    setBookmarks([]);
  };

  /**
   * Append an import's new bookmarks (see planBookmarkImport). Existing records
   * are never touched. The old path cleared everything and re-added it, which
   * re-id'd, unpinned and stripped every bookmark on every import.
   */
  const importBookmarks = (additions: Bookmark[], folderAdditions: Folder[] = []) => {
    const folderIds = new Set(folders.map((f) => f.id));
    const newFolders = folderAdditions.filter((f) => !folderIds.has(f.id));
    const ids = new Set(bookmarks.map((b) => b.id));
    const urls = new Set(bookmarks.map((b) => b.url));
    const fresh = additions.filter((b) => !ids.has(b.id) && !urls.has(b.url));
    if (fresh.length === 0 && newFolders.length === 0) return;
    // Bringing back something deleted here but not yet pushed: without this the
    // next pull would drop it again.
    newFolders.forEach((f) => unqueueDelete("folders", userId, f.id));
    fresh.forEach((b) => unqueueDelete("bookmarks", userId, b.id));
    if (newFolders.length > 0) setFolders((prev) => [...prev, ...newFolders]);
    if (fresh.length > 0) {
      // A label with no folderId (the HTML importer's) maps to a folder you have.
      const filed = backfillBookmarkFolderIds(fresh, [...folders, ...newFolders]);
      setBookmarks((prev) => [...prev, ...filed]);
    }
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
      parentFolderKey: parentKey,
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
              parentFolderKey: nextParentId,
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
    queueDelete("folders", userId, folderId);
    setBookmarks((prev) =>
      prev.map((bookmark) =>
        bookmark.folderId === folderId
          ? { ...bookmark, folderId: null, folder: undefined }
          : bookmark
      )
    );
    return { ok: true };
  };

  const mergeFolder = (
    sourceFolderId: string,
    targetFolderId: string
  ): { ok: true } | { ok: false; reason: string } => {
    const source = folders.find((folder) => folder.id === sourceFolderId);
    if (!source) return { ok: false, reason: "Source folder not found." };
    const target = folders.find((folder) => folder.id === targetFolderId);
    if (!target) return { ok: false, reason: "Target folder not found." };
    if (sourceFolderId === targetFolderId) {
      return { ok: false, reason: "Pick a different target folder." };
    }

    const hasChildren = folders.some((folder) => folder.parentId === sourceFolderId);
    if (hasChildren) {
      return { ok: false, reason: "This folder has subfolders." };
    }

    setBookmarks((prev) =>
      prev.map((bookmark) =>
        bookmark.folderId === sourceFolderId
          ? { ...bookmark, folderId: targetFolderId, folder: target.name }
          : bookmark
      )
    );
    setFolders((prev) => prev.filter((folder) => folder.id !== sourceFolderId));
    queueDelete("folders", userId, sourceFolderId);
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

      // Remote is authoritative, but: drop anything deleted locally and not yet
      // pushed (so the pull can't resurrect it), and keep a local-only item only
      // if the cloud NEVER had it (new here, not yet pushed). One the cloud had
      // at the last sync and lacks now was deleted on another device — keeping
      // it put it back on the next push.
      const pendingB = pendingDeleteIds("bookmarks", userId);
      const pendingF = pendingDeleteIds("folders", userId);
      const remoteB = new Set(nextState.bookmarks.map((b) => b.id));
      const remoteF = new Set(nextState.folders.map((f) => f.id));

      const mergedBookmarks = nextState.bookmarks.filter((b) => !pendingB.has(b.id));
      newHere(bookmarks, remoteB, "bookmarks", userId).forEach((b) => {
        if (!pendingB.has(b.id)) mergedBookmarks.push(b);
      });

      const mergedFolders = nextState.folders.filter((f) => !pendingF.has(f.id));
      newHere(folders, remoteF, "folders", userId).forEach((f) => {
        if (!pendingF.has(f.id)) mergedFolders.push(f);
      });

      recordSyncedIds("bookmarks", userId, remoteB);
      recordSyncedIds("folders", userId, remoteF);
      setBookmarks(mergedBookmarks);
      setFolders(mergedFolders);
      saveToStorage(mergedBookmarks, mergedFolders, userIdHint);
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
      await saveBookmarks(userIdHint, bookmarks, folders, shortcuts);
      // The pushed arrays already omit deleted items — cloud matches local now.
      clearPendingDeletes("bookmarks", userId);
      clearPendingDeletes("folders", userId);
      recordSyncedIds("bookmarks", userId, bookmarks.map((b) => b.id));
      recordSyncedIds("folders", userId, folders.map((f) => f.id));
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
    const restored = normalizeBookmarks(
      snapshot.map((bookmark) => ({
        ...bookmark,
        pinned: typeof bookmark.pinned === "boolean" ? bookmark.pinned : false,
      }))
    );
    // Undo of a delete/clear: these ids are back, so cancel any queued deletion.
    restored.forEach((b) => unqueueDelete("bookmarks", userId, b.id));
    setBookmarks(restored);
  };

  /**
   * Put a backup back as it was, folder tree included. Restoring bookmarks alone
   * left them pointing at folders that no longer existed — hidden from the grid
   * and from Unstaged until a reload. `folders` undefined (a backup from before
   * backups carried folders) keeps today's tree, and any bookmark whose folder
   * isn't in it shows in Unstaged at once.
   */
  const restoreBackup = (snapshot: Bookmark[], snapshotFolders?: Folder[]) => {
    const tree = snapshotFolders ? normalizeFolders(snapshotFolders) : folders;
    const restored = backfillBookmarkFolderIds(
      normalizeBookmarks(
        snapshot.map((b) => ({ ...b, pinned: typeof b.pinned === "boolean" ? b.pinned : false }))
      ),
      tree
    );
    restored.forEach((b) => unqueueDelete("bookmarks", userId, b.id));
    if (snapshotFolders) {
      tree.forEach((f) => unqueueDelete("folders", userId, f.id));
      setFolders(tree);
    }
    setBookmarks(restored);
  };

  return {
    bookmarks,
    folders,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    importBookmarks,
    restoreBackup,
    restoreFromSnapshot,
    addFolder,
    updateFolder,
    deleteFolder,
    mergeFolder,
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

export {
  folderNameKey,
  normalizeFolderName,
  migrateLegacyData,
  planBackupImport,
  planBookmarkImport,
  planFolderImport,
  planFolderPaths,
  planHtmlImport,
};
