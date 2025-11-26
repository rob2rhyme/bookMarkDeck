// src/utils/firestoreBookmarks.ts
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { Bookmark } from "@/types/bookmark";

const userDocRef = (uid: string) => doc(db, "users", uid);

export type FirestoreBookmarkPayload = {
  bookmarks: Bookmark[];
  updatedAt?: string;
};

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
    bookmarks: Array.isArray(data.bookmarks) ? (data.bookmarks as Bookmark[]) : [],
    updatedAt,
  };
}

export async function saveBookmarks(userIdHint: string, bookmarks: Bookmark[]): Promise<void> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  await setDoc(userDocRef(user.uid), {
    bookmarks,
    updatedAt: serverTimestamp(),
    version: 1,
  });
}
