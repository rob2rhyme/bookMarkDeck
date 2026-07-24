import { describe, it, expect } from "vitest";
import { bookmarksToNetscapeHtml } from "./bookmarksToHtml";
import type { Bookmark } from "@/types/bookmark";

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
