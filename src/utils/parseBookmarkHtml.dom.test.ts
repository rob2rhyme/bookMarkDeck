import { describe, it, expect } from "vitest";
import { parseBookmarkHtml } from "./parseBookmarkHtml";

// jsdom project — parseBookmarkHtml uses DOMParser, which node lacks.

// Chrome's export: the Bookmarks bar holds a subfolder FIRST and a direct link
// after it — the shape that exposed the old parser, which credited every link
// in a list to that list's first subfolder heading.
const CHROME = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000001" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000001">Work</H3>
        <DL><p>
            <DT><A HREF="https://jira.example/" ADD_DATE="1700000100">Jira</A>
            <DT><H3 ADD_DATE="1700000000">Clients</H3>
            <DL><p>
                <DT><A HREF="https://acme.example/" ADD_DATE="1700000150">Acme</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="https://news.example/" ADD_DATE="1700000200">News</A>
    </DL><p>
    <DT><A HREF="https://loose.example/" ADD_DATE="1700000300">Loose</A>
</DL><p>
`;

// Firefox's export: links before subfolders, a <DD> description, TAGS.
const FIREFOX = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; img-src data: *; object-src 'none'"></meta>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><A HREF="https://menu.example/" ADD_DATE="1700000400" LAST_MODIFIED="1700000401" TAGS="read, later">Menu link</A>
    <DD>Worth a second look
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3>
    <DL><p>
        <DT><A HREF="https://toolbar.example/" ADD_DATE="1700000500">Toolbar link</A>
        <DT><H3 ADD_DATE="1700000000">Dev</H3>
        <DL><p>
            <DT><A HREF="https://mdn.example/" ADD_DATE="1700000600">MDN</A>
        </DL><p>
    </DL><p>
</DL>
`;

const byTitle = (html: string) =>
  new Map(parseBookmarkHtml(html).map((b) => [b.title, b]));

describe("parseBookmarkHtml", () => {
  it("extracts a link's title and (absolute) url", () => {
    const out = parseBookmarkHtml(`<DL><DT><A HREF="https://example.com">Example</A></DL>`);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://example.com/");
    expect(out[0].title).toBe("Example");
    expect(out[0].tags).toEqual([]);
    expect(out[0].folderPath).toEqual([]);
  });

  it("falls back to the href when the anchor has no text", () => {
    const out = parseBookmarkHtml(`<A HREF="https://no-text.example.com/"></A>`);
    expect(out[0].title).toBe("https://no-text.example.com/");
  });

  it("returns [] when there are no links", () => {
    expect(parseBookmarkHtml("<p>nothing here</p>")).toEqual([]);
  });

  describe("folder paths", () => {
    it("files each Chrome link under its OWN list's heading", () => {
      const b = byTitle(CHROME);
      expect(b.get("Jira")!.folderPath).toEqual(["Bookmarks bar", "Work"]);
      expect(b.get("Acme")!.folderPath).toEqual(["Bookmarks bar", "Work", "Clients"]);
      // A direct link beside a subfolder: the old parser put this in "Work".
      expect(b.get("News")!.folderPath).toEqual(["Bookmarks bar"]);
      expect(b.get("Loose")!.folderPath).toEqual([]);
    });

    it("files each Firefox link under its own list's heading", () => {
      const b = byTitle(FIREFOX);
      expect(b.get("Menu link")!.folderPath).toEqual([]);
      expect(b.get("Toolbar link")!.folderPath).toEqual(["Bookmarks Toolbar"]);
      expect(b.get("MDN")!.folderPath).toEqual(["Bookmarks Toolbar", "Dev"]);
    });
  });

  // The app's own export writes these; the parser used to throw them away.
  describe("notes, tags and dates", () => {
    it("reads a <DD> description as the note", () => {
      expect(byTitle(FIREFOX).get("Menu link")!.note).toBe("Worth a second look");
      expect(byTitle(FIREFOX).get("Toolbar link")!.note).toBe("");
    });

    it("reads TAGS, split and trimmed", () => {
      expect(byTitle(FIREFOX).get("Menu link")!.tags).toEqual(["read", "later"]);
    });

    it("reads ADD_DATE as the creation date", () => {
      expect(byTitle(CHROME).get("Jira")!.createdAt).toBe(
        new Date(1700000100 * 1000).toISOString()
      );
    });
  });

  // Pocket's own export: two lists under <h1> headings, `time_added` for the date.
  describe("a Pocket export", () => {
    const POCKET = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pocket Export</title></head><body>
<h1>Unread</h1>
<ul>
<li><a href="https://example.com/read" time_added="1700000000" tags="reading,later">An unread article</a></li>
</ul>
<h1>Read Archive</h1>
<ul>
<li><a href="https://example.com/done" time_added="1600000000" tags="">A finished one</a></li>
</ul></body></html>`;

    it("files unread links under Pocket and archived ones under Pocket / Read archive", () => {
      const b = byTitle(POCKET);
      expect(b.get("An unread article")!.folderPath).toEqual(["Pocket"]);
      expect(b.get("A finished one")!.folderPath).toEqual(["Pocket", "Read archive"]);
    });

    it("reads time_added as the date and tags as tags", () => {
      const b = byTitle(POCKET);
      expect(b.get("An unread article")!.createdAt).toBe(new Date(1700000000 * 1000).toISOString());
      expect(b.get("An unread article")!.tags).toEqual(["reading", "later"]);
      expect(b.get("A finished one")!.tags).toEqual([]);
    });
  });

  // Raindrop's HTML export is a Netscape file with real folders and TAGS, so it
  // already read; this pins that it keeps doing so.
  describe("a Raindrop HTML export", () => {
    const RAINDROP = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Raindrop.io</TITLE>
<H1>Raindrop.io</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">Dev</H3>
    <DL><p>
        <DT><A HREF="https://doc.rust-lang.org/book/" ADD_DATE="1700000100" TAGS="rust,learning">Rust book</A>
        <DD>Read ch. 4 first
    </DL><p>
</DL><p>`;

    it("keeps the collection, tags, note and date", () => {
      const r = byTitle(RAINDROP).get("Rust book")!;
      expect(r.folderPath).toEqual(["Dev"]);
      expect(r.tags).toEqual(["rust", "learning"]);
      expect(r.note).toBe("Read ch. 4 first");
    });
  });
});
