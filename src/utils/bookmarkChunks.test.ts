import { describe, expect, it } from "vitest";

import { ANY_UID, docBytes, DocTooLargeError, MAX_DOC_BYTES } from "@/lib/docSize";
import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";
import { chunkId, CHUNK_BUDGET_BYTES, fitsOneDocument, MAX_CHUNKS, packLibrary, unpackLibrary } from "./bookmarkChunks";

const bm = (i: number, note = ""): Bookmark =>
  ({ id: `b${i}`, title: `Bookmark ${i}`, url: `https://example.com/${i}`, createdAt: "2026-01-01T00:00:00Z", ...(note ? { note } : {}) }) as Bookmark;
const folder = (i: number): Folder => ({ id: `f${i}`, name: `Folder ${i}`, parentId: null }) as Folder;

describe("packLibrary", () => {
  it("keeps a small library in one chunk", () => {
    const chunks = packLibrary([folder(1)], [bm(1), bm(2)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].bookmarks.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("gives an empty library one empty chunk, not none", () => {
    expect(packLibrary([], [])).toEqual([{ folders: [], bookmarks: [] }]);
  });

  it("cuts a large library into chunks that each fit, keeping order", () => {
    const bookmarks = Array.from({ length: 5_000 }, (_, i) => bm(i, "n".repeat(300)));
    const chunks = packLibrary([folder(1), folder(2)], bookmarks);
    expect(chunks.length).toBeGreaterThan(1);
    for (const [i, c] of chunks.entries()) {
      const bytes = docBytes(["users", ANY_UID, "bookmarkLibrary", chunkId(i)], { i, folders: c.folders, bookmarks: c.bookmarks });
      expect(bytes).toBeLessThanOrEqual(CHUNK_BUDGET_BYTES);
      expect(bytes).toBeLessThan(MAX_DOC_BYTES);
    }
    const back = unpackLibrary(chunks);
    expect(back.bookmarks.map((b) => b.id)).toEqual(bookmarks.map((b) => b.id));
    expect(back.folders.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("puts folders ahead of bookmarks, so chunk 0 is where a reader finds the tree", () => {
    const chunks = packLibrary([folder(1)], Array.from({ length: 4_000 }, (_, i) => bm(i, "n".repeat(300))));
    expect(chunks[0].folders.map((f) => f.id)).toEqual(["f1"]);
    expect(chunks.slice(1).every((c) => c.folders.length === 0)).toBe(true);
  });

  it("refuses a single record bigger than a chunk", () => {
    expect(() => packLibrary([], [bm(1, "x".repeat(CHUNK_BUDGET_BYTES))])).toThrow(DocTooLargeError);
  });

  it("refuses a library past the most one save can write, saying nothing was uploaded", () => {
    const bookmarks = Array.from({ length: 40_000 }, (_, i) => bm(i, "n".repeat(300)));
    let err: unknown;
    try {
      packLibrary([], bookmarks);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DocTooLargeError);
    expect((err as Error).message).toMatch(/Nothing was uploaded/);
    expect(MAX_CHUNKS).toBe(14);
  });
});

describe("chunkId and fitsOneDocument", () => {
  it("names chunks so a listing sorts in order", () => {
    expect([2, 10, 1].map(chunkId).sort()).toEqual(["001", "002", "010"]);
  });
  it("judges one document by its bytes", () => {
    expect(fitsOneDocument(["users", "u"], { bookmarks: [bm(1)] })).toBe(true);
    expect(fitsOneDocument(["users", "u"], { bookmarks: [bm(1, "x".repeat(MAX_DOC_BYTES))] })).toBe(false);
  });
});
