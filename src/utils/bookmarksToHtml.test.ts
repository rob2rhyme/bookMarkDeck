import { describe, it, expect } from "vitest";
import { bookmarksToNetscapeHtml } from "./bookmarksToHtml";
import type { Bookmark } from "@/types/bookmark";
import type { Folder } from "@/types/folder";

const bm = (over: Partial<Bookmark> = {}): Bookmark => ({
  id: "1",
  title: "Example",
  url: "https://example.com",
  createdAt: "2026-01-01T00:00:00Z",
  tags: [],
  ...over,
});

describe("bookmarksToNetscapeHtml", () => {
  it("emits a Netscape header + DL wrapper", () => {
    const html = bookmarksToNetscapeHtml([bm()]);
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html).toContain("<DL><p>");
    expect(html).toContain('<A HREF="https://example.com"');
  });

  it("escapes HTML in title, url, tags and notes", () => {
    const html = bookmarksToNetscapeHtml([
      bm({
        title: `a<b>&"`,
        url: "https://x.com/?a=1&b=2",
        note: "<script>",
        tags: ["a&b"],
      }),
    ]);
    expect(html).toContain("a&lt;b&gt;&amp;&quot;");
    expect(html).toContain("a=1&amp;b=2");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('TAGS="a&amp;b"');
    expect(html).not.toContain("<script>");
  });

  it("groups foldered bookmarks under an H3, before their children", () => {
    const html = bookmarksToNetscapeHtml([
      bm({ id: "r", title: "Root", folder: undefined }),
      bm({ id: "f", title: "Filed", folder: "Work" }),
    ]);
    expect(html).toContain("<H3>Work</H3>");
    expect(html.indexOf("<H3>Work</H3>")).toBeLessThan(html.indexOf("Filed"));
  });

  it("includes a note as a <DD> line", () => {
    const html = bookmarksToNetscapeHtml([bm({ note: "remember this" })]);
    expect(html).toContain("<DD>remember this");
  });
});

// The exporter used to group by the denormalised `bookmark.folder` NAME, which
// renames and auto-organize never update: renamed folders exported under old
// names, nesting flattened, same-named folders merged, auto-organized links came
// out unfiled, and empty folders vanished. It now walks the real tree.
describe("bookmarksToNetscapeHtml — the folder tree", () => {
  const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
    id,
    name,
    parentId,
  });
  /** Each H3 or link, indented by nesting depth — the file's structure at a glance. */
  const outline = (html: string) => {
    let depth = 0;
    const out: string[] = [];
    for (const line of html.split("\n")) {
      const h3 = /<H3>(.*)<\/H3>/.exec(line);
      const a = /<A [^>]*>(.*)<\/A>/.exec(line);
      if (h3) out.push(`${"  ".repeat(depth)}[${h3[1]}]`);
      else if (a) out.push(`${"  ".repeat(depth)}${a[1]}`);
      if (line.includes("<DL><p>")) depth++;
      if (line.includes("</DL><p>")) depth--;
    }
    return out;
  };

  it("exports a renamed folder under its current name", () => {
    const html = bookmarksToNetscapeHtml(
      [bm({ title: "Jira", folderId: "w", folder: "Old name" })],
      [folder("w", "Work")]
    );
    expect(outline(html)).toEqual(["  [Work]", "    Jira"]);
  });

  it("keeps nesting", () => {
    const html = bookmarksToNetscapeHtml(
      [bm({ id: "a", title: "Acme", folderId: "c" })],
      [folder("w", "Work"), folder("c", "Clients", "w")]
    );
    expect(outline(html)).toEqual(["  [Work]", "    [Clients]", "      Acme"]);
  });

  it("keeps two same-named folders apart", () => {
    const html = bookmarksToNetscapeHtml(
      [bm({ id: "1", title: "One", folderId: "a" }), bm({ id: "2", title: "Two", folderId: "b" })],
      [folder("a", "Notes"), folder("w", "Work"), folder("b", "Notes", "w")]
    );
    expect(outline(html)).toEqual([
      "  [Notes]",
      "    One",
      "  [Work]",
      "    [Notes]",
      "      Two",
    ]);
  });

  // Auto-organize sets folderId only; the stale label used to win.
  it("files an auto-organized bookmark by its folderId, not its stale label", () => {
    const html = bookmarksToNetscapeHtml(
      [bm({ title: "Docs", folderId: "w", folder: undefined })],
      [folder("w", "Work")]
    );
    expect(outline(html)).toEqual(["  [Work]", "    Docs"]);
  });

  it("includes empty folders", () => {
    expect(outline(bookmarksToNetscapeHtml([], [folder("e", "Someday")]))).toEqual(["  [Someday]"]);
  });

  it("never drops a folder caught in a parent cycle", () => {
    const html = bookmarksToNetscapeHtml(
      [bm({ title: "Kept", folderId: "x" })],
      [folder("x", "X", "y"), folder("y", "Y", "x")]
    );
    expect(outline(html).join("\n")).toContain("Kept");
  });
});
