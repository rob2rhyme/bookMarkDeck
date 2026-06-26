import { describe, expect, it } from "vitest";

import {
  baseKey,
  buildOrganizePlan,
  categoryFor,
  categoryForFolderName,
  dominantCategory,
} from "@/utils/autoOrganize";
import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";

const bm = (
  id: string,
  url: string,
  folderId: string | null = null,
  title = ""
): Bookmark => ({ id, title, url, folderId, createdAt: "2026-01-01" });

const fld = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
});

describe("categoryFor (bookmark)", () => {
  it("matches by domain/brand and avoids substring false positives", () => {
    expect(categoryFor(bm("1", "https://gist.github.com/x"))?.name).toBe("Dev");
    expect(categoryFor(bm("2", "https://claude.ai"))?.name).toBe("AI");
    expect(categoryFor(bm("3", "https://www.netflix.com/x"))?.name).toBe("Video");
    expect(categoryFor(bm("4", "https://www.amazon.co.uk/dp/X"))?.name).toBe("Shopping");
    expect(categoryFor(bm("5", "https://unknown-blog.example"))).toBeNull();
  });
});

describe("categoryForFolderName", () => {
  it("matches folder names by whole-word alias", () => {
    expect(categoryForFolderName("Amazon")?.name).toBe("Shopping");
    expect(categoryForFolderName("Best Buy")?.name).toBe("Shopping");
    expect(categoryForFolderName("My Coding Stuff")?.name).toBe("Dev");
    expect(categoryForFolderName("ADULT DAY CARE")).toBeNull();
  });
});

describe("dominantCategory", () => {
  it("uses the majority category of a folder's bookmarks", () => {
    const dev = dominantCategory([
      bm("1", "https://github.com/a"),
      bm("2", "https://stackoverflow.com/q"),
      bm("3", "https://unknown.example"),
    ]);
    expect(dev?.name).toBe("Dev");
    expect(dominantCategory([bm("1", "https://github.com/a")])).toBeNull(); // needs ≥2
  });
});

describe("baseKey", () => {
  it("strips a leading badge and lowercases", () => {
    expect(baseKey("🛒 Shopping")).toBe("shopping");
    expect(baseKey("Shopping")).toBe("shopping");
  });
});

describe("buildOrganizePlan", () => {
  it("nests matching top-level folders under a new badged parent", () => {
    const plan = buildOrganizePlan([], [fld("a", "Amazon"), fld("b", "Ebay")]);
    expect(plan.categories).toHaveLength(1);
    const shop = plan.categories[0];
    expect(shop).toMatchObject({ name: "Shopping", parentIsNew: true, parentName: "🛒 Shopping" });
    expect(shop.folders.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });

  it("reuses + badges an existing category folder as the parent", () => {
    const plan = buildOrganizePlan([], [fld("shop", "Shopping"), fld("a", "Amazon")]);
    const shop = plan.categories.find((c) => c.name === "Shopping")!;
    expect(shop.parentIsNew).toBe(false);
    expect(shop.parentFolderId).toBe("shop");
    expect(shop.parentRename).toEqual({ from: "Shopping", to: "🛒 Shopping" });
    expect(shop.folders.map((f) => f.id)).toEqual(["a"]);
  });

  it("nests by dominant bookmark category when the name doesn't match", () => {
    const folders = [fld("m", "Misc")];
    const bookmarks = [bm("1", "https://github.com/a", "m"), bm("2", "https://npmjs.com/p", "m")];
    const plan = buildOrganizePlan(bookmarks, folders);
    const dev = plan.categories.find((c) => c.name === "Dev")!;
    expect(dev.folders.map((f) => f.id)).toEqual(["m"]);
  });

  it("refiles only loose (unfiled) bookmarks, and can be turned off", () => {
    const bookmarks = [bm("1", "https://github.com/a", null), bm("2", "https://github.com/b", "somefolder")];
    const on = buildOrganizePlan(bookmarks, []);
    expect(on.categories.find((c) => c.name === "Dev")?.bookmarks.map((b) => b.id)).toEqual(["1"]);
    const off = buildOrganizePlan(bookmarks, [], { refileLoose: false });
    expect(off.categories.find((c) => c.name === "Dev")).toBeUndefined();
  });

  it("merges duplicate folders and counts unmatched folders", () => {
    const plan = buildOrganizePlan(
      [],
      [fld("a", "Reading"), fld("b", "reading"), fld("c", "ADULT DAY CARE")]
    );
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0]).toMatchObject({ sourceId: "b", targetId: "a" });
    expect(plan.unmatchedFolders).toBe(2); // "Reading" survivor + "ADULT DAY CARE"
  });
});
