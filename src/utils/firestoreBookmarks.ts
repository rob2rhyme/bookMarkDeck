// src/utils/firestoreBookmarks.ts
import { cleanHighlights } from "@/utils/highlights";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { Bookmark } from "@/types/bookmark";
import { Folder } from "@/types/folder";
import { ShortcutApp } from "@/types/shortcut";

const userDocRef = (uid: string) => doc(db, "users", uid);
const userBackupsCollectionRef = (uid: string) =>
  collection(db, "users", uid, "bookmarkBackups");

const MAX_BACKUPS = 7;

export type FirestoreBookmarkPayload = {
  bookmarks: Bookmark[];
  folders?: Folder[];
  updatedAt?: string;
};

export type FirestoreBookmarkBackup = {
  id: string;
  bookmarks: Bookmark[];
  folders?: Folder[];
  createdAt: string;
  shortcuts?: ShortcutApp[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : sanitizeForFirestore(item)
    ) as T;
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      const cleaned = sanitizeForFirestore(entry);
      if (cleaned !== undefined) output[key] = cleaned;
    }
    return output as T;
  }

  return value;
}

function sanitizeBookmark(raw: Bookmark): Bookmark {
  const base: Bookmark = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" ? raw.title : "",
    url: typeof raw.url === "string" ? raw.url : "",
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };

  const optional: Partial<Bookmark> = {};

  if (typeof raw.note === "string" && raw.note.length > 0) optional.note = raw.note;
  if (typeof raw.folder === "string" && raw.folder.length > 0) optional.folder = raw.folder;
  if (typeof raw.folderId === "string") optional.folderId = raw.folderId;
  if (raw.folderId === null) optional.folderId = null;
  if (typeof raw.icon === "string" && raw.icon.trim().length > 0)
    optional.icon = raw.icon.trim();

  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter(
      (tag): tag is string => typeof tag === "string" && tag.length > 0
    );
    if (tags.length > 0) optional.tags = tags;
  }

  if (typeof raw.hits === "number") optional.hits = raw.hits;
  if (typeof raw.lastUsedAt === "string" && raw.lastUsedAt.length > 0)
    optional.lastUsedAt = raw.lastUsedAt;
  if (typeof raw.pinned === "boolean") optional.pinned = raw.pinned;
  const highlights = cleanHighlights(raw.highlights);
  if (highlights) optional.highlights = highlights;

  return { ...base, ...optional };
}

function sanitizeFolder(raw: Folder): Folder {
  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  const parentFolderKey =
    typeof raw.parentId === "string"
      ? raw.parentId
      : typeof raw.parentFolderKey === "string"
        ? raw.parentFolderKey
        : null;
  const base: Folder = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    name,
    parentId: parentFolderKey,
    parentFolderKey,
  };
  const optional: Partial<Folder> = {};
  if (typeof raw.sortOrder === "number") optional.sortOrder = raw.sortOrder;
  if (typeof raw.createdAt === "string") optional.createdAt = raw.createdAt;
  if (typeof raw.updatedAt === "string") optional.updatedAt = raw.updatedAt;
  return { ...base, ...optional };
}

function sanitizeShortcut(raw: ShortcutApp): ShortcutApp {
  const base: ShortcutApp = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "",
    url: typeof raw.url === "string" ? raw.url : "",
  };
  const icon = typeof raw.icon === "string" && raw.icon.trim() ? raw.icon : undefined;
  return icon ? { ...base, icon } : base;
}

export async function fetchBookmarks(
  userIdHint: string
): Promise<FirestoreBookmarkPayload> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const snap = await getDoc(userDocRef(user.uid));
  if (!snap.exists()) return { bookmarks: [], folders: [], updatedAt: undefined };
  const data = snap.data();
  const updatedAt =
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate().toISOString()
      : typeof data.updatedAt === "string"
        ? data.updatedAt
        : undefined;
  return {
    bookmarks: Array.isArray(data.bookmarks)
      ? (data.bookmarks as Bookmark[]).map(sanitizeBookmark)
      : [],
    folders: Array.isArray(data.folders)
      ? (data.folders as Folder[])
          .map(sanitizeFolder)
          .filter((folder) => Boolean(folder.name))
      : undefined,
    updatedAt,
  };
}

async function createBackupSnapshot(
  uid: string,
  bookmarks: Bookmark[],
  folders: Folder[],
  shortcuts?: ShortcutApp[]
) {
  const createdAt = new Date();
  const payload = {
    bookmarks,
    folders,
    shortcuts: shortcuts?.map(sanitizeShortcut) ?? [],
    createdAt: Timestamp.fromDate(createdAt),
  };
  await addDoc(userBackupsCollectionRef(uid), sanitizeForFirestore(payload));

  const all = await getDocs(
    query(userBackupsCollectionRef(uid), orderBy("createdAt", "desc"))
  );
  const extras = all.docs.slice(MAX_BACKUPS);
  if (extras.length > 0) {
    await Promise.all(extras.map((docSnap) => deleteDoc(docSnap.ref)));
  }
}

export async function fetchBookmarkBackups(
  userIdHint: string
): Promise<FirestoreBookmarkBackup[]> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const snap = await getDocs(
    query(userBackupsCollectionRef(user.uid), orderBy("createdAt", "desc"))
  );

  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : typeof data.createdAt === "string"
          ? data.createdAt
          : new Date().toISOString();

    const backupBookmarks = Array.isArray(data.bookmarks)
      ? (data.bookmarks as Bookmark[]).map(sanitizeBookmark)
      : [];
    const backupFolders = Array.isArray(data.folders)
      ? (data.folders as Folder[])
          .map(sanitizeFolder)
          .filter((folder) => Boolean(folder.name))
      : undefined;
    const backupShortcuts = Array.isArray(data.shortcuts)
      ? (data.shortcuts as ShortcutApp[]).map(sanitizeShortcut)
      : undefined;

    return {
      id: docSnap.id,
      bookmarks: backupBookmarks,
      folders: backupFolders,
      createdAt,
      shortcuts: backupShortcuts,
    };
  });
}

export async function saveBookmarks(
  userIdHint: string,
  bookmarks: Bookmark[],
  folders: Folder[],
  shortcuts?: ShortcutApp[]
): Promise<void> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const sanitizedBookmarks = bookmarks.map(sanitizeBookmark);
  const sanitizedFolders = folders
    .map(sanitizeFolder)
    .filter((folder) => Boolean(folder.name));
  await createBackupSnapshot(user.uid, sanitizedBookmarks, sanitizedFolders, shortcuts);
  const payload = {
    bookmarks: sanitizedBookmarks,
    folders: sanitizedFolders,
    updatedAt: serverTimestamp(),
    version: 2,
  };
  await setDoc(userDocRef(user.uid), sanitizeForFirestore(payload), { merge: true });
}
