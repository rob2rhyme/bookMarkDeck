import { describe, expect, it } from "vitest";

import { baseKey, buildOrganizePlan, categoryFor } from "@/utils/autoOrganize";
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

describe("categoryFor", () => {
  it("matches by registrable domain / subdomain", () => {
    expect(categoryFor(bm("1", "https://github.com/foo"))?.name).toBe("Dev");
    expect(categoryFor(bm("2", "https://gist.github.com/x"))?.name).toBe("Dev");
    expect(categoryFor(bm("3", "https://claude.ai"))?.name).toBe("AI");
  });

  it("avoids substring false positives (netflix is not x.com/Social)", () => {
    expect(categoryFor(bm("1", "https://www.netflix.com/title/1"))?.name).toBe(
      "Video"
    );
  });

  it("matches multi-TLD brands and returns null for unknowns", () => {
    expect(categoryFor(bm("1", "https://www.amazon.co.uk/dp/X"))?.name).toBe(
      "Shopping"
    );
    expect(categoryFor(bm("2", "https://some-random-blog.example/post"))).toBeNull();
  });
});

describe("baseKey", () => {
  it("strips a leading badge and lowercases", () => {
    expect(baseKey("🛠 Dev")).toBe("dev");
    expect(baseKey("Dev")).toBe("dev");
  });
});

describe("buildOrganizePlan", () => {
  it("merges duplicate folders into the fullest survivor", () => {
    const folders = [fld("a", "Reading"), fld("b", "reading")];
    const bookmarks = [
      bm("1", "https://x.example", "a"),
      bm("2", "https://y.example", "a"),
      bm("3", "https://z.example", "b"),
    ];
    const plan = buildOrganizePlan(bookmarks, folders);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0]).toMatchObject({ sourceId: "b", targetId: "a", count: 1 });
  });

  it("won't merge a duplicate that has subfolders", () => {
    const folders = [fld("a", "Work"), fld("b", "work"), fld("c", "child", "b")];
    const plan = buildOrganizePlan([], folders);
    expect(plan.merges).toHaveLength(0);
  });

  it("creates a badged folder and routes bookmarks to it", () => {
    const plan = buildOrganizePlan(
      [bm("1", "https://github.com/a"), bm("2", "https://stackoverflow.com/q/1")],
      []
    );
    expect(plan.creates).toEqual([{ key: "new:Dev", name: "🛠 Dev", count: 2 }]);
    expect(plan.moves.map((m) => m.bookmarkId).sort()).toEqual(["1", "2"]);
    expect(plan.moves[0].targetKey).toBe("new:Dev");
  });

  it("reuses + badges an existing category folder, and skips already-filed", () => {
    const folders = [fld("dev", "Dev")];
    const plan = buildOrganizePlan(
      [
        bm("1", "https://github.com/a", "dev"), // already in Dev → no move
        bm("2", "https://npmjs.com/p", null), // unfiled → move into Dev
      ],
      folders
    );
    expect(plan.creates).toHaveLength(0);
    expect(plan.renames).toEqual([{ folderId: "dev", from: "Dev", to: "🛠 Dev" }]);
    expect(plan.alreadyFiled).toBe(1);
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]).toMatchObject({ bookmarkId: "2", targetKey: "dev" });
  });

  it("counts unmatched bookmarks without moving them", () => {
    const plan = buildOrganizePlan([bm("1", "https://no-match.example")], []);
    expect(plan.unmatched).toBe(1);
    expect(plan.moves).toHaveLength(0);
  });
});
