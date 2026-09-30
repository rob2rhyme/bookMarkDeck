// The JSON backup file: what "Download backup" writes and JSON import reads.
// Pure — see bookmarkBackupFile.test.ts.

import type { FirestoreBookmarkBackup } from "@/utils/firestoreBookmarks";

/** Full-fidelity JSON, folder tree included — it used to be left out. */
export function buildBackupFile(backup: Omit<FirestoreBookmarkBackup, "id"> & { id?: string }) {
  return {
    createdAt: backup.createdAt,
    bookmarks: backup.bookmarks,
    folders: backup.folders ?? [],
    shortcuts: backup.shortcuts ?? [],
    type: "bookmarkdeck-backup",
    version: 1,
  };
}

/** A backup file (or a bare bookmarks array), or null when it isn't JSON. */
export function parseBackupJson(
  text: string
): { bookmarks: unknown[]; folders: unknown[]; shortcuts: unknown[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { bookmarks: parsed, folders: [], shortcuts: [] };
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return { bookmarks: list(o.bookmarks), folders: list(o.folders), shortcuts: list(o.shortcuts) };
}
