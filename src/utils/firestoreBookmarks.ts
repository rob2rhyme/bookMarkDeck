// src/utils/firestoreBookmarks.ts
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { Bookmark } from "@/types/bookmark";

const userDocRef = (uid: string) => doc(db, "users", uid);

export type FirestoreBookmarkPayload = {
  bookmarks: Bookmark[];
  updatedAt?: string;
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

export async function saveBookmarks(userIdHint: string, bookmarks: Bookmark[]): Promise<void> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const sanitized = bookmarks.map(sanitizeBookmark);
  await setDoc(userDocRef(user.uid), {
    bookmarks: sanitized,
    updatedAt: serverTimestamp(),
    version: 1,
  });
}
