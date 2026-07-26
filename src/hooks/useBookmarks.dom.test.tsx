import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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
