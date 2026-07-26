import { describe, it, expect } from "vitest";
import { buildFolderPathLabel, makeFolderOptions } from "./folderOptions";
import type { Folder } from "@/types/folder";

const f = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
});

describe("buildFolderPathLabel", () => {
  it("builds a nested path root → leaf", () => {
    const map = new Map<string, Folder>([
      ["a", f("a", "Work")],
      ["b", f("b", "Projects", "a")],
      ["c", f("c", "Q1", "b")],
    ]);
    expect(buildFolderPathLabel("c", map)).toBe("Work / Projects / Q1");
  });

  it("returns the single name for a root folder", () => {
    const map = new Map<string, Folder>([["a", f("a", "Work")]]);
    expect(buildFolderPathLabel("a", map)).toBe("Work");
  });

  it("stops safely on a parent cycle instead of looping forever", () => {
    const map = new Map<string, Folder>([
      ["a", f("a", "A", "b")],
      ["b", f("b", "B", "a")],
    ]);
    const parts = buildFolderPathLabel("a", map).split(" / ").sort();
    expect(parts).toEqual(["A", "B"]);
  });

  it("returns '' for an unknown folder id", () => {
    expect(buildFolderPathLabel("missing", new Map())).toBe("");
  });
});

describe("makeFolderOptions", () => {
  it("labels each folder with its full path and sorts by label", () => {
    const opts = makeFolderOptions([
      f("a", "Work"),
      f("b", "Projects", "a"),
      f("z", "Archive"),
    ]);
    expect(opts.map((o) => o.label)).toEqual([
      "Archive",
      "Work",
      "Work / Projects",
    ]);
    expect(opts.find((o) => o.id === "b")?.label).toBe("Work / Projects");
  });
});
