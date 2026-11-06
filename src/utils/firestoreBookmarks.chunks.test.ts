import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => (await import("@/test/fakeFirestore")).createFakeFirestore());
vi.mock("@/lib/firebase", () => ({ db: { __db: true }, ensureFirebaseGoogleAuth: async () => ({ uid: "u1" }) }));

import * as firestore from "firebase/firestore";
import { DocTooLargeError } from "@/lib/docSize";
import { fetchBookmarkBackups, fetchBookmarks, saveBookmarks } from "@/utils/firestoreBookmarks";
import { saveShortcuts } from "@/utils/firestoreShortcuts";

// A bookmark library that outgrows one Firestore document (1 MiB) used to be unable to
// sync at all. It is now cut into chunk documents, written in one atomic batch. A
// library that fits is stored exactly as before — these tests pin both, and that the
// two shapes convert into each other without leaving the old one behind.
const fake = (firestore as unknown as { __fake: unknown }).__fake as {
  store: Map<string, Record<string, unknown>>;
  paths: (prefix: string) => string[];
  get: (path: string) => Record<string, unknown> | undefined;
  reset: () => void;
  batches: number;
};

const bookmark = (i: number, note = "") => ({
  id: `b${i}`,
  title: `Bookmark ${i}`,
  url: `https://example.com/${i}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...(note ? { note } : {}),
});
const library = (n: number, note = "") => Array.from({ length: n }, (_, i) => bookmark(i, note));
const folders = [
  { id: "f1", name: "Reading", parentId: null },
  { id: "f2", name: "Work", parentId: "f1" },
];
const ids = (list: { id: string }[]) => list.map((x) => x.id);
const save = (b: ReturnType<typeof library>, f = folders, s?: { id: string; name: string; url: string }[]) =>
  saveBookmarks("me@example.com", b as never, f as never, s as never);

beforeEach(() => fake.reset());

describe("a library that fits one document", () => {
  it("is stored as it always was: arrays on the root, no chunks, one plain backup", async () => {
    await save(library(50));
    const root = fake.get("users/u1")!;
    expect(Array.isArray(root.bookmarks)).toBe(true);
    expect("libraryChunks" in root).toBe(false);
    expect(fake.paths("users/u1/bookmarkLibrary")).toEqual([]);
    const backups = fake.paths("users/u1/bookmarkBackups/");
    expect(backups).toHaveLength(1);
    expect(Array.isArray(fake.get(backups[0])!.bookmarks)).toBe(true);
  });

  it("reads back what it stored", async () => {
    await save(library(50));
    const got = await fetchBookmarks("me@example.com");
    expect(ids(got.bookmarks)).toEqual(ids(library(50)));
    expect(ids(got.folders ?? [])).toEqual(["f1", "f2"]);
  });
});

describe("a library too big for one document", () => {
  const big = library(5_000, "n".repeat(300)); // ~3 MB

  it("is cut into chunks, with the root keeping only the marker, in one atomic batch", async () => {
    const before = fake.batches;
    await save(big);
    const root = fake.get("users/u1")!;
    expect(root.libraryChunks).toBeGreaterThan(1);
    expect("bookmarks" in root).toBe(false);
    expect("folders" in root).toBe(false);
    const chunks = fake.paths("users/u1/bookmarkLibrary/");
    expect(chunks).toHaveLength(root.libraryChunks as number);
    // The backup took one batch and the library another: nothing is written piecemeal.
    expect(fake.batches - before).toBe(2);
  });

  it("reads back whole and in order, folders included", async () => {
    await save(big);
    const got = await fetchBookmarks("me@example.com");
    expect(ids(got.bookmarks)).toEqual(ids(big));
    expect(ids(got.folders ?? [])).toEqual(["f1", "f2"]);
    expect(got.bookmarks[1234].note).toBe("n".repeat(300));
  });

  it("keeps a backup that is chunked too, and offers it whole", async () => {
    await save(big);
    const [backupPath] = fake.paths("users/u1/bookmarkBackups/").filter((p) => p.split("/").length === 4);
    expect(typeof fake.get(backupPath)!.chunks).toBe("number");
    expect("bookmarks" in fake.get(backupPath)!).toBe(false);
    const backups = await fetchBookmarkBackups("me@example.com");
    expect(backups).toHaveLength(1);
    expect(ids(backups[0].bookmarks)).toEqual(ids(big));
    expect(ids(backups[0].folders ?? [])).toEqual(["f1", "f2"]);
  });

  it("survives the shortcuts being saved on the same document", async () => {
    await save(big);
    await saveShortcuts("me@example.com", [{ id: "s1", name: "Mail", url: "https://mail.example.com" }] as never);
    const got = await fetchBookmarks("me@example.com");
    expect(got.bookmarks).toHaveLength(5_000);
    expect(fake.get("users/u1")!.libraryChunks).toBeGreaterThan(1);
  });
});

describe("moving between the two shapes", () => {
  it("a library that shrinks back to one document drops its chunks and its marker", async () => {
    await save(library(5_000, "n".repeat(300)));
    expect(fake.paths("users/u1/bookmarkLibrary/").length).toBeGreaterThan(1);
    await save(library(20));
    const root = fake.get("users/u1")!;
    expect(Array.isArray(root.bookmarks)).toBe(true);
    expect("libraryChunks" in root).toBe(false);
    expect(fake.paths("users/u1/bookmarkLibrary/")).toEqual([]);
    expect(ids((await fetchBookmarks("me@example.com")).bookmarks)).toEqual(ids(library(20)));
  });

  it("a library that grows past one document moves to chunks and loses its arrays", async () => {
    await save(library(20));
    await save(library(5_000, "n".repeat(300)));
    const root = fake.get("users/u1")!;
    expect("bookmarks" in root).toBe(false);
    expect(root.libraryChunks).toBeGreaterThan(1);
    expect((await fetchBookmarks("me@example.com")).bookmarks).toHaveLength(5_000);
  });

  it("a chunked library that gets smaller leaves no stale chunk behind", async () => {
    await save(library(6_000, "n".repeat(300)));
    const many = fake.paths("users/u1/bookmarkLibrary/").length;
    await save(library(3_000, "n".repeat(300)));
    const now = fake.paths("users/u1/bookmarkLibrary/").length;
    expect(now).toBeLessThan(many);
    expect(now).toBe(fake.get("users/u1")!.libraryChunks);
    expect((await fetchBookmarks("me@example.com")).bookmarks).toHaveLength(3_000);
  });
});

describe("a chunked library that is cut short", () => {
  it("is refused on read, never handed back as if it were the whole", async () => {
    await save(library(5_000, "n".repeat(300)));
    const [first] = fake.paths("users/u1/bookmarkLibrary/");
    fake.store.delete(first);
    await expect(fetchBookmarks("me@example.com")).rejects.toThrow(/incomplete.*missing.*Nothing was changed on this device/);
  });

  it("leaves out a backup with a missing part rather than offering a truncated restore", async () => {
    await save(library(5_000, "n".repeat(300)));
    const part = fake.paths("users/u1/bookmarkBackups/").find((p) => p.includes("/chunks/"))!;
    fake.store.delete(part);
    expect(await fetchBookmarkBackups("me@example.com")).toEqual([]);
  });
});

describe("a library too big even for chunks", () => {
  it("is refused before anything is written — no backup, no chunk, no marker", async () => {
    const huge = library(40_000, "n".repeat(300));
    await expect(save(huge)).rejects.toBeInstanceOf(DocTooLargeError);
    expect([...fake.store.keys()]).toEqual([]);
  });
});

describe("backups of a chunked library", () => {
  it("are pruned to seven, taking their parts with them", async () => {
    for (let n = 0; n < 9; n++) {
      // Distinct sizes, so every save is a real change.
      await save(library(4_000 + n, "n".repeat(300)));
      await new Promise((r) => setTimeout(r, 2)); // distinct createdAt, so "newest seven" is well defined
    }
    const all = fake.paths("users/u1/bookmarkBackups/");
    const parents = all.filter((p) => p.split("/").length === 4);
    expect(parents).toHaveLength(7);
    const orphaned = all.filter((p) => p.split("/").length > 4 && !parents.includes(p.split("/").slice(0, 4).join("/")));
    expect(orphaned).toEqual([]);
  }, 60_000);
});
