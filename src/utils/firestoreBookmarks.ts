// src/utils/firestoreBookmarks.ts
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

  return { ...base, ...optional };
}

function sanitizeFolder(raw: Folder): Folder {
  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    name,
    parentId: typeof raw.parentId === "string" ? raw.parentId : null,
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
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
  await addDoc(userBackupsCollectionRef(uid), {
    bookmarks,
    folders,
    shortcuts: shortcuts?.map(sanitizeShortcut) ?? [],
    createdAt: Timestamp.fromDate(createdAt),
  });

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
  await setDoc(userDocRef(user.uid), {
    bookmarks: sanitizedBookmarks,
    folders: sanitizedFolders,
    updatedAt: serverTimestamp(),
    version: 2,
  });
}
