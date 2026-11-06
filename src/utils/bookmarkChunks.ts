// A bookmark library that doesn't fit one Firestore document (1 MiB) is stored as
// several. This is only the arithmetic: how to cut folders and bookmarks into pieces
// that each fit, and how to put them back. Where the pieces live is firestoreBookmarks.
//
// Order is the whole contract. Unpacking is concatenation, so the library comes back
// in the order it went in — folders in their order, bookmarks in theirs.

import { DocTooLargeError, MAX_DOC_BYTES, ANY_UID, docBytes, tooLargeMessage, valueSize } from "@/lib/docSize";
import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";

export type LibraryChunk = { folders: Folder[]; bookmarks: Bookmark[] };

/**
 * What one chunk may hold, by `docBytes`. Well under the 1 MiB limit because that count
 * errs high only for nested maps, and a chunk that gets refused is a library that
 * cannot sync.
 */
export const CHUNK_BUDGET_BYTES = 600_000;

/**
 * Chunks one save may write. All of them go in a single atomic batch, and Firestore
 * caps a commit at 10 MiB; 14 × the budget stays inside that with room to spare.
 */
export const MAX_CHUNKS = 14;

/** Room the chunk document itself takes: its name, its field names and its index. */
const CHUNK_OVERHEAD = docBytes(["users", ANY_UID, "bookmarkLibrary", "000"], { i: 0, folders: [], bookmarks: [] }) + 64;

/** Chunk documents are named by zero-padded index, so a listing sorts in order. */
export const chunkId = (i: number) => String(i).padStart(3, "0");

/**
 * Cut the library into the fewest chunks, in order, each within `budget`. Throws a
 * `DocTooLargeError` when it can't be done: one record bigger than a chunk, or more
 * than `MAX_CHUNKS` chunks of them.
 */
export function packLibrary(
  folders: readonly Folder[],
  bookmarks: readonly Bookmark[],
  budget: number = CHUNK_BUDGET_BYTES
): LibraryChunk[] {
  const room = budget - CHUNK_OVERHEAD;
  const chunks: LibraryChunk[] = [];
  let current: LibraryChunk = { folders: [], bookmarks: [] };
  let used = 0;

  const place = (kind: "folders" | "bookmarks", item: Folder | Bookmark) => {
    const size = valueSize(item);
    if (size > room) {
      throw new DocTooLargeError(size, "One of your bookmarks or folders is too large to store. Shorten its note or tags.");
    }
    if (used + size > room) {
      chunks.push(current);
      current = { folders: [], bookmarks: [] };
      used = 0;
    }
    (current[kind] as (Folder | Bookmark)[]).push(item);
    used += size;
  };

  folders.forEach((f) => place("folders", f));
  bookmarks.forEach((b) => place("bookmarks", b));
  if (current.folders.length || current.bookmarks.length || chunks.length === 0) chunks.push(current);

  if (chunks.length > MAX_CHUNKS) {
    const bytes = chunks.length * budget;
    throw new DocTooLargeError(
      bytes,
      tooLargeMessage(
        bytes,
        "Your bookmark library",
        "Nothing was uploaded; everything stays on this device. Even split across several records it is more than can be saved at once — removing bookmarks you no longer need, or shortening notes, brings it under."
      )
    );
  }
  return chunks;
}

/** The library back, in the order it was packed. */
export function unpackLibrary(chunks: readonly LibraryChunk[]): { folders: Folder[]; bookmarks: Bookmark[] } {
  return {
    folders: chunks.flatMap((c) => c.folders),
    bookmarks: chunks.flatMap((c) => c.bookmarks),
  };
}

/** True when the whole library, as one document at the root with `extra` beside it, would fit. */
export function fitsOneDocument(path: readonly string[], data: Record<string, unknown>): boolean {
  return docBytes(path, data) <= MAX_DOC_BYTES;
}
