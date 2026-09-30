import { describe, expect, it } from "vitest";

import { buildBackupFile, parseBackupJson } from "@/utils/bookmarkBackupFile";

const BACKUP = {
  id: "b1",
  createdAt: "2026-09-01T00:00:00.000Z",
  bookmarks: [{ id: "x", title: "X", url: "https://x.example", createdAt: "2026-01-01T00:00:00.000Z", folderId: "f1" }],
  folders: [{ id: "f1", name: "Work", parentId: null }],
  shortcuts: [],
};

describe("backup file", () => {
  // "Download backup" used to leave the folder tree out of the file entirely.
  it("carries the folder tree", () => {
    expect(buildBackupFile(BACKUP).folders).toEqual(BACKUP.folders);
  });

  it("round-trips bookmarks, folders and shortcuts", () => {
    const parsed = parseBackupJson(JSON.stringify(buildBackupFile(BACKUP)));
    expect(parsed).toEqual({
      bookmarks: BACKUP.bookmarks,
      folders: BACKUP.folders,
      shortcuts: [],
    });
  });

  it("reads a bare bookmarks array", () => {
    expect(parseBackupJson(JSON.stringify(BACKUP.bookmarks))).toEqual({
      bookmarks: BACKUP.bookmarks,
      folders: [],
      shortcuts: [],
    });
  });

  it("returns null for something that isn't JSON", () => {
    expect(parseBackupJson("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBeNull();
  });
});
