// src/utils/firestoreShortcuts.ts
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, ensureFirebaseGoogleAuth } from "@/lib/firebase";
import { ShortcutApp } from "@/types/shortcut";

const userDocRef = (uid: string) => doc(db, "users", uid);

export type FirestoreShortcutsPayload = {
  shortcuts: ShortcutApp[];
  updatedAt?: string;
};

function sanitizeShortcut(raw: ShortcutApp): ShortcutApp {
  const base: ShortcutApp = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "",
    url: typeof raw.url === "string" ? raw.url : "",
  };

  const icon = typeof raw.icon === "string" && raw.icon.trim() ? raw.icon : undefined;

  return icon ? { ...base, icon } : base;
}

export async function fetchShortcuts(userIdHint: string): Promise<FirestoreShortcutsPayload> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const snap = await getDoc(userDocRef(user.uid));
  if (!snap.exists()) return { shortcuts: [], updatedAt: undefined };
  const data = snap.data();
  const updatedAt =
    data.shortcutsUpdatedAt instanceof Timestamp
      ? data.shortcutsUpdatedAt.toDate().toISOString()
      : typeof data.shortcutsUpdatedAt === "string"
        ? data.shortcutsUpdatedAt
        : undefined;
  return {
    shortcuts: Array.isArray(data.shortcuts)
      ? (data.shortcuts as ShortcutApp[]).map(sanitizeShortcut)
      : [],
    updatedAt,
  };
}

export async function saveShortcuts(userIdHint: string, shortcuts: ShortcutApp[]): Promise<void> {
  const user = await ensureFirebaseGoogleAuth(userIdHint);
  const sanitized = shortcuts.map(sanitizeShortcut);
  await setDoc(
    userDocRef(user.uid),
    {
      shortcuts: sanitized,
      shortcutsUpdatedAt: serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );
}
