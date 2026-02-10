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
import { ShortcutApp } from "@/types/shortcut";

const userDocRef = (uid: string) => doc(db, "users", uid);
const userBackupsCollectionRef = (uid: string) =>
  collection(db, "users", uid, "bookmarkBackups");

const MAX_BACKUPS = 7;

export type FirestoreBookmarkPayload = {
  bookmarks: Bookmark[];
  updatedAt?: string;
};

export type FirestoreBookmarkBackup = {
  id: string;
  bookmarks: Bookmark[];
  createdAt: string;
  shortcuts?: ShortcutApp[];
};

function sanitizeBookmark(raw: Bookmark): Bookmark {
  const base: Bookmark = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" ? raw.title : "",
    url: typeof raw.url === "string" ? raw.url : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };

  const optional: Partial<Bookmark> = {};

  if (typeof raw.note === "string" && raw.note.length > 0) optional.note = raw.note;
  if (typeof raw.folder === "string" && raw.folder.length > 0) optional.folder = raw.folder;
  if (typeof raw.icon === "string" && raw.icon.trim().length > 0)
    optional.icon = raw.icon.trim();

  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
    if (tags.length > 0) optional.tags = tags;
  }

  if (typeof raw.hits === "number") optional.hits = raw.hits;
  if (typeof raw.lastUsedAt === "string" && raw.lastUsedAt.length > 0)
    optional.lastUsedAt = raw.lastUsedAt;
  if (typeof raw.pinned === "boolean") optional.pinned = raw.pinned;

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

export async function fetchBookmarks(userIdHint: string): Promise<FirestoreBookmarkPayload> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const snap = await getDoc(userDocRef(user.uid));
  if (!snap.exists()) return { bookmarks: [], updatedAt: undefined };
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
    updatedAt,
  };
}

async function createBackupSnapshot(uid: string, bookmarks: Bookmark[], shortcuts?: ShortcutApp[]) {
  const createdAt = new Date();
  await addDoc(userBackupsCollectionRef(uid), {
    bookmarks,
    shortcuts: shortcuts?.map(sanitizeShortcut) ?? [],
    createdAt: Timestamp.fromDate(createdAt),
  });

  // Keep only the most recent MAX_BACKUPS snapshots
  const all = await getDocs(
    query(userBackupsCollectionRef(uid), orderBy("createdAt", "desc"))
  );
  const extras = all.docs.slice(MAX_BACKUPS);
  if (extras.length > 0) {
    await Promise.all(extras.map((docSnap) => deleteDoc(docSnap.ref)));
  }
}

export async function fetchBookmarkBackups(userIdHint: string): Promise<FirestoreBookmarkBackup[]> {
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
    const backupShortcuts = Array.isArray(data.shortcuts)
      ? (data.shortcuts as ShortcutApp[]).map(sanitizeShortcut)
      : undefined;

    return {
      id: docSnap.id,
      bookmarks: backupBookmarks,
      createdAt,
      shortcuts: backupShortcuts,
    };
  });
}

export async function saveBookmarks(
  userIdHint: string,
  bookmarks: Bookmark[],
  shortcuts?: ShortcutApp[]
): Promise<void> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const sanitized = bookmarks.map(sanitizeBookmark);
  await createBackupSnapshot(user.uid, sanitized, shortcuts);
  await setDoc(userDocRef(user.uid), {
    bookmarks: sanitized,
    updatedAt: serverTimestamp(),
    version: 1,
  });
}
