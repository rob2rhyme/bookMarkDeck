// src/utils/firestoreBookmarks.ts
import { cleanHighlights } from "@/utils/highlights";
import { cleanReadLater } from "@/utils/readLater";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { assertDocFits } from "@/lib/docSize";
import { chunkId, fitsOneDocument, packLibrary, unpackLibrary, type LibraryChunk } from "@/utils/bookmarkChunks";
import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { Bookmark } from "@/types/bookmark";
import { Folder } from "@/types/folder";
import { ShortcutApp } from "@/types/shortcut";

const userDocRef = (uid: string) => doc(db, "users", uid);
const userBackupsCollectionRef = (uid: string) =>
  collection(db, "users", uid, "bookmarkBackups");

const MAX_BACKUPS = 7;

// A library that fits one document (almost every library) is stored as it always was:
// `bookmarks[]` and `folders[]` on users/{uid}. One that doesn't is cut into chunk
// documents under users/{uid}/bookmarkLibrary, and the root says so with `libraryChunks`.
// The marker, not `version` — saveShortcuts overwrites `version` on the same document.
const libraryChunksRef = (uid: string) => collection(db, "users", uid, "bookmarkLibrary");
// A backup of a library that doesn't fit one document is the same, under its own document.
const backupChunksRef = (backupRef: ReturnType<typeof doc>) => collection(backupRef, "chunks");

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
  Object.assign(optional, cleanReadLater(raw));

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
  if (typeof data.libraryChunks === "number" && data.libraryChunks > 0) {
    const chunks = await readChunks(
      libraryChunksRef(user.uid),
      data.libraryChunks,
      "Your cloud bookmark library is incomplete"
    );
    const { bookmarks, folders } = unpackLibrary(chunks);
    return {
      bookmarks: bookmarks.map(sanitizeBookmark),
      folders: folders.map(sanitizeFolder).filter((folder) => Boolean(folder.name)),
      updatedAt,
    };
  }
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

/**
 * The `count` chunks under `ref`, in order. Throws when any is missing or malformed:
 * a partial library handed back as the whole one would be taken as the cloud's truth,
 * and a pull would then drop everything the missing chunk held.
 */
async function readChunks(
  ref: ReturnType<typeof collection>,
  count: number,
  incomplete: string
): Promise<LibraryChunk[]> {
  const found = new Map<number, LibraryChunk>();
  (await getDocs(ref)).docs.forEach((d) => {
    const data = d.data();
    if (Number.isInteger(data.i) && Array.isArray(data.bookmarks) && Array.isArray(data.folders)) {
      found.set(data.i as number, { bookmarks: data.bookmarks as Bookmark[], folders: data.folders as Folder[] });
    }
  });
  const chunks: LibraryChunk[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = found.get(i);
    if (!chunk) {
      throw new Error(`${incomplete} (part ${i + 1} of ${count} is missing). Nothing was changed on this device — try again in a moment.`);
    }
    chunks.push(chunk);
  }
  return chunks;
}

async function createBackupSnapshot(
  uid: string,
  bookmarks: Bookmark[],
  folders: Folder[],
  shortcuts?: ShortcutApp[],
  fitsOne = true
) {
  const createdAt = new Date();
  const payload = {
    bookmarks,
    folders,
    shortcuts: shortcuts?.map(sanitizeShortcut) ?? [],
    createdAt: Timestamp.fromDate(createdAt),
  };
  if (fitsOne) {
    await addDoc(userBackupsCollectionRef(uid), sanitizeForFirestore(payload));
  } else {
    // Too big for one document: the backup document keeps the date and shortcuts and
    // says how many chunks follow; one atomic batch, so a backup is whole or absent.
    const chunks = packLibrary(folders, bookmarks);
    const ref = doc(userBackupsCollectionRef(uid));
    const batch = writeBatch(db);
    batch.set(
      ref,
      sanitizeForFirestore({ shortcuts: payload.shortcuts, createdAt: payload.createdAt, chunks: chunks.length })
    );
    chunks.forEach((chunk, i) =>
      batch.set(doc(backupChunksRef(ref), chunkId(i)), sanitizeForFirestore({ i, ...chunk }))
    );
    await batch.commit();
  }

  const all = await getDocs(
    query(userBackupsCollectionRef(uid), orderBy("createdAt", "desc"))
  );
  for (const extra of all.docs.slice(MAX_BACKUPS)) {
    // Deleting a document leaves its subcollection behind: take a chunked backup's parts first.
    if (typeof extra.data().chunks === "number") {
      const parts = await getDocs(backupChunksRef(extra.ref));
      if (parts.docs.length > 0) {
        const batch = writeBatch(db);
        parts.docs.forEach((part) => batch.delete(part.ref));
        await batch.commit();
      }
    }
    await deleteDoc(extra.ref);
  }
}

export async function fetchBookmarkBackups(
  userIdHint: string
): Promise<FirestoreBookmarkBackup[]> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const snap = await getDocs(
    query(userBackupsCollectionRef(user.uid), orderBy("createdAt", "desc"))
  );

  const backups = await Promise.all(snap.docs.map(async (docSnap): Promise<FirestoreBookmarkBackup | null> => {
    const data = docSnap.data();
    const createdAt =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : typeof data.createdAt === "string"
          ? data.createdAt
          : new Date().toISOString();

    let rawBookmarks: unknown = data.bookmarks;
    let rawFolders: unknown = data.folders;
    if (typeof data.chunks === "number" && data.chunks > 0) {
      try {
        const { bookmarks, folders } = unpackLibrary(
          await readChunks(backupChunksRef(docSnap.ref), data.chunks, "This backup is incomplete")
        );
        rawBookmarks = bookmarks;
        rawFolders = folders;
      } catch {
        // A backup cut short is not offered: restoring it would drop what it lacks.
        return null;
      }
    }
    const backupBookmarks = Array.isArray(rawBookmarks)
      ? (rawBookmarks as Bookmark[]).map(sanitizeBookmark)
      : [];
    const backupFolders = Array.isArray(rawFolders)
      ? (rawFolders as Folder[])
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
  }));
  return backups.filter((b): b is FirestoreBookmarkBackup => b !== null);
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
  const sanitizedShortcuts = shortcuts?.map(sanitizeShortcut) ?? [];
  const payload = {
    bookmarks: sanitizedBookmarks,
    folders: sanitizedFolders,
    updatedAt: serverTimestamp(),
    version: 2,
  };

  // Which shape each copy takes is settled before anything is written. The library is
  // one document (beside the shortcuts it shares) when it fits, and so is each backup
  // of it; when it doesn't, it is cut into chunks. A library too big even for that is
  // refused here, before a backup has been taken.
  const libraryFitsOne = fitsOneDocument(
    ["users", user.uid],
    sanitizeForFirestore({ ...payload, shortcuts: sanitizedShortcuts, shortcutsUpdatedAt: serverTimestamp() })
  );
  const backupFitsOne = fitsOneDocument(
    ["users", user.uid, "bookmarkBackups", "x".repeat(20)],
    sanitizeForFirestore({
      bookmarks: sanitizedBookmarks,
      folders: sanitizedFolders,
      shortcuts: sanitizedShortcuts,
      createdAt: Timestamp.fromDate(new Date()),
    })
  );
  const chunks = libraryFitsOne ? null : packLibrary(sanitizedFolders, sanitizedBookmarks);
  if (!backupFitsOne) packLibrary(sanitizedFolders, sanitizedBookmarks);
  if (chunks) {
    // What stays on the root document is the shortcuts and a few small fields.
    assertDocFits(
      ["users", user.uid],
      sanitizeForFirestore({ libraryChunks: chunks.length, updatedAt: serverTimestamp(), shortcuts: sanitizedShortcuts, shortcutsUpdatedAt: serverTimestamp() }),
      "Your shortcuts",
      "Nothing was uploaded; everything stays on this device. Remove shortcuts you no longer use."
    );
  }

  // Chunks a previous save left behind. One read of an empty collection costs the same
  // as one document, so the common case pays for a single read.
  const left = (await getDocs(libraryChunksRef(user.uid))).docs;

  await createBackupSnapshot(user.uid, sanitizedBookmarks, sanitizedFolders, shortcuts, backupFitsOne);

  if (!chunks) {
    if (left.length === 0) {
      await setDoc(userDocRef(user.uid), sanitizeForFirestore(payload), { merge: true });
      return;
    }
    // The library shrank back to one document: the root takes the arrays and drops the
    // marker in the same commit that removes the chunks, so no reader sees both.
    const batch = writeBatch(db);
    batch.set(
      userDocRef(user.uid),
      { ...sanitizeForFirestore(payload), libraryChunks: deleteField() },
      { merge: true }
    );
    left.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return;
  }

  // Chunked: every chunk, the marker and the removal of leftovers commit together or not
  // at all. A reader sees the old library or the new one, never half of each.
  const batch = writeBatch(db);
  const kept = new Set<string>();
  chunks.forEach((chunk, i) => {
    kept.add(chunkId(i));
    batch.set(doc(libraryChunksRef(user.uid), chunkId(i)), sanitizeForFirestore({ i, ...chunk }));
  });
  left.filter((d) => !kept.has(d.id)).forEach((d) => batch.delete(d.ref));
  batch.set(
    userDocRef(user.uid),
    { libraryChunks: chunks.length, updatedAt: serverTimestamp(), bookmarks: deleteField(), folders: deleteField() },
    { merge: true }
  );
  await batch.commit();
}
