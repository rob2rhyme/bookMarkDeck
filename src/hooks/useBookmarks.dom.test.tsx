import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Bookmark } from "@/types/bookmark";

// Mock the Firestore + pending-delete layers so the hook loads without Firebase.
vi.mock("@/utils/firestoreBookmarks", () => ({
  fetchBookmarks: vi.fn().mockResolvedValue(null),
  saveBookmarks: vi.fn().mockResolvedValue(undefined),
  fetchBookmarkBackups: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/utils/pendingDeletes", () => ({
  clearPendingDeletes: vi.fn(),
  pendingDeleteIds: vi.fn().mockReturnValue([]),
  queueDelete: vi.fn(),
  unqueueDelete: vi.fn(),
}));

import { useBookmarks } from "./useBookmarks";

beforeEach(() => localStorage.clear());

describe("useBookmarks", () => {
  it("adds bookmarks newest-first", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    expect(result.current.bookmarks).toHaveLength(0);
    act(() => result.current.addBookmark({ title: "A", url: "https://a.com" }));
    act(() => result.current.addBookmark({ title: "B", url: "https://b.com" }));
    expect(result.current.bookmarks.map((b) => b.title)).toEqual(["B", "A"]);
  });

  it("deletes a bookmark by id", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    act(() => result.current.addBookmark({ title: "A", url: "https://a.com" }));
    const id = result.current.bookmarks[0].id;
    act(() => result.current.deleteBookmark(id));
    expect(result.current.bookmarks).toHaveLength(0);
  });

  it("rejects moving a folder into its own descendant (cycle guard)", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    let parentId = "";
    let childId = "";
    act(() => {
      parentId = result.current.addFolder({ name: "Parent" })!.id;
    });
    act(() => {
      childId = result.current.addFolder({ name: "Child", parentId })!.id;
    });

    let res: { ok: boolean; reason?: string } = { ok: true };
    act(() => {
      res = result.current.updateFolder(parentId, { parentId: childId });
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("itself or its descendant");
  });
});

// Two open tabs share one localStorage cache. The hook read it once on mount and
// then wrote its whole in-memory copy on every change — so a stale tab, the
// moment you opened a bookmark in it (which bumps `hits`), put back its old copy
// and erased what another tab had added. With cloud sync manual, the cache is
// the only copy of anything not yet pushed.
describe("useBookmarks across tabs", () => {
  const KEY = "bookmarkdeck:v2:test-user";
  const bm = (id: string, url: string): Bookmark => ({
    id,
    title: id,
    url,
    note: "",
    tags: [],
    pinned: false,
    hits: 0,
    folderId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const X = bm("x", "https://x.example");
  const Y = bm("y", "https://y.example");
  const stored = () => JSON.parse(localStorage.getItem(KEY)!) as { bookmarks: Bookmark[] };

  /** What the browser does when ANOTHER tab writes: the value changes, and this
   *  document gets a storage event for it. */
  function otherTabWrites(bookmarks: Bookmark[] | null, key = KEY) {
    const newValue = bookmarks ? JSON.stringify({ version: 2, bookmarks, folders: [] }) : null;
    if (newValue) localStorage.setItem(key, newValue);
    else localStorage.removeItem(key);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue, storageArea: localStorage })
      );
    });
  }

  function mountWith(bookmarks: Bookmark[]) {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, bookmarks, folders: [] }));
    return renderHook(() => useBookmarks("test-user"));
  }

  it("keeps a bookmark another tab added when this tab then opens one", () => {
    const { result } = mountWith([X]);
    otherTabWrites([X, Y]);
    act(() => result.current.updateBookmark("x", { hits: 1 })); // opening X
    const ids = stored().bookmarks.map((b) => b.id).sort();
    expect(ids).toEqual(["x", "y"]);
    expect(stored().bookmarks.find((b) => b.id === "x")!.hits).toBe(1);
  });

  it("shows the other tab's bookmarks without a reload", () => {
    const { result } = mountWith([X]);
    otherTabWrites([X, Y]);
    expect(result.current.bookmarks.map((b) => b.id)).toEqual(["x", "y"]);
  });

  it("does not write back what it adopted", () => {
    mountWith([X]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    otherTabWrites([X, Y]);
    // The one call is the simulated other tab's own write.
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("never wipes its state because another tab removed the key", () => {
    const { result } = mountWith([X]);
    otherTabWrites(null);
    expect(result.current.bookmarks.map((b) => b.id)).toEqual(["x"]);
  });

  it("ignores another account's cache", () => {
    const { result } = mountWith([X]);
    otherTabWrites([Y], "bookmarkdeck:v2:someone-else");
    expect(result.current.bookmarks.map((b) => b.id)).toEqual(["x"]);
  });
});
