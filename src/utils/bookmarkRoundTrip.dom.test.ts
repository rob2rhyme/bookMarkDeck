import { describe, expect, it, vi } from "vitest";

// Export -> import must give you back what you had. Before these fixes an HTML
// round trip misfiled direct links, flattened the tree into Unstaged, and
// dropped every note, tag and date. The pure planners are imported from the
// hook module, so its Firestore helpers are stubbed.
vi.mock("@/utils/firestoreBookmarks", () => ({
  fetchBookmarks: vi.fn(),
  saveBookmarks: vi.fn(),
  fetchBookmarkBackups: vi.fn(),
}));
vi.mock("@/utils/pendingDeletes", () => ({
  clearPendingDeletes: vi.fn(),
  pendingDeleteIds: vi.fn(() => new Set()),
  queueDelete: vi.fn(),
  unqueueDelete: vi.fn(),
}));

import { planHtmlImport } from "@/hooks/useBookmarks";
import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";
import { bookmarksToNetscapeHtml } from "@/utils/bookmarksToHtml";
import { parseBookmarkHtml } from "@/utils/parseBookmarkHtml";

const FOLDERS: Folder[] = [
  { id: "w", name: "Work", parentId: null },
  { id: "c", name: "Clients", parentId: "w" },
  { id: "e", name: "Someday", parentId: null },
];
const BOOKMARKS: Bookmark[] = [
  {
    id: "1",
    title: "Jira",
    url: "https://jira.example/",
    folderId: "w",
    folder: "Stale label",
    note: "Sprint board",
    tags: ["work", "daily"],
    createdAt: "2025-03-04T05:06:07.000Z",
  },
  {
    id: "2",
    title: "Acme",
    url: "https://acme.example/",
    folderId: "c",
    tags: [],
    createdAt: "2025-04-05T06:07:08.000Z",
  },
  {
    id: "3",
    title: "Loose",
    url: "https://loose.example/",
    folderId: null,
    tags: [],
    createdAt: "2025-05-06T07:08:09.000Z",
  },
];

describe("HTML export -> import round trip", () => {
  it("brings back every link with its folder path, note, tags and date", () => {
    const html = bookmarksToNetscapeHtml(BOOKMARKS, FOLDERS);
    const plan = planHtmlImport([], [], parseBookmarkHtml(html));

    const folders = new Map(plan.folderAdditions.map((f) => [f.id, f]));
    const pathOf = (id: string | null | undefined): string[] => {
      const out: string[] = [];
      for (let f = id ? folders.get(id) : undefined; f; f = f.parentId ? folders.get(f.parentId) : undefined) {
        out.unshift(f.name);
      }
      return out;
    };

    const back = Object.fromEntries(
      plan.additions.map((b) => [
        b.url,
        { title: b.title, path: pathOf(b.folderId), note: b.note, tags: b.tags, createdAt: b.createdAt },
      ])
    );
    expect(back).toEqual({
      "https://jira.example/": {
        title: "Jira",
        path: ["Work"],
        note: "Sprint board",
        tags: ["work", "daily"],
        createdAt: "2025-03-04T05:06:07.000Z",
      },
      "https://acme.example/": {
        title: "Acme",
        path: ["Work", "Clients"],
        note: "",
        tags: [],
        createdAt: "2025-04-05T06:07:08.000Z",
      },
      "https://loose.example/": {
        title: "Loose",
        path: [],
        note: "",
        tags: [],
        createdAt: "2025-05-06T07:08:09.000Z",
      },
    });
    // Import creates the folders its links need — never one just to hold links it
    // skipped as duplicates (#330). So an EMPTY folder is written into the file,
    // for the browser importing it, but doesn't come back here; the JSON backup
    // is the format that carries the whole tree, empty folders included.
    expect([...folders.values()].map((f) => f.name).sort()).toEqual(["Clients", "Work"]);
    expect(html).toContain("<H3>Someday</H3>");
  });
});
