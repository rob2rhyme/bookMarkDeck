import { describe, expect, it } from "vitest";

import { parseServiceCsv } from "./parseServiceCsv";

const NOW = new Date("2026-10-21T12:00:00.000Z");

const RAINDROP = `id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite
1,"Rust book","Read ch. 4 first","The Rust Programming Language",https://doc.rust-lang.org/book/,Dev,"rust, learning",2024-03-05T10:15:30.000Z,,,true
2,Loose link,,,https://example.com/loose,Unsorted,,2024-04-01T00:00:00.000Z,,,false
3,"Has, a comma",,,https://example.com/comma,"Reading list","a,b",2024-05-09T08:00:00.000Z,,,false
4,No link here,,,,Dev,,2024-05-09T08:00:00.000Z,,,false
`;

const POCKET = `title,url,time_added,tags,status
Pocket article,https://example.com/read,1700000000,reading|later,unread
Old one,https://example.com/old,1600000000,,archive
`;

describe("parseServiceCsv — Raindrop", () => {
  const r = parseServiceCsv(RAINDROP, NOW)!;
  const by = (t: string) => r.bookmarks.find((b) => b.title === t)!;

  it("is recognised, and skips a row with no link", () => {
    expect(r.flavour).toBe("raindrop");
    expect(r.bookmarks).toHaveLength(3);
    expect(r.skipped).toBe(1);
  });

  it("maps the note, tags, collection, date and favourite", () => {
    expect(by("Rust book")).toEqual({
      title: "Rust book",
      url: "https://doc.rust-lang.org/book/",
      note: "Read ch. 4 first",
      tags: ["rust", "learning"],
      createdAt: "2024-03-05T10:15:30.000Z",
      folderPath: ["Dev"],
      pinned: true,
    });
  });

  it("leaves the catch-all 'Unsorted' collection unfiled, and does not pin a non-favourite", () => {
    expect(by("Loose link").folderPath).toEqual([]);
    expect(by("Loose link").pinned).toBeUndefined();
  });

  it("keeps commas inside quoted titles and tags", () => {
    expect(by("Has, a comma").tags).toEqual(["a", "b"]);
    expect(by("Has, a comma").folderPath).toEqual(["Reading list"]);
  });
});

describe("parseServiceCsv — Pocket", () => {
  const r = parseServiceCsv(POCKET, NOW)!;

  it("is recognised, with '|' separated tags and unix dates", () => {
    expect(r.flavour).toBe("pocket");
    expect(r.bookmarks[0]).toMatchObject({
      title: "Pocket article",
      tags: ["reading", "later"],
      createdAt: new Date(1700000000 * 1000).toISOString(),
    });
  });

  it("files unread links under Pocket and archived ones under Pocket / Read archive", () => {
    expect(r.bookmarks[0].folderPath).toEqual(["Pocket"]);
    expect(r.bookmarks[1].folderPath).toEqual(["Pocket", "Read archive"]);
  });
});

describe("parseServiceCsv — other files", () => {
  it("reads any CSV with a url column, in any column order and case", () => {
    const r = parseServiceCsv("URL,Title\nhttps://a.example,A\n", NOW)!;
    expect(r.flavour).toBe("generic");
    expect(r.bookmarks[0]).toMatchObject({ title: "A", url: "https://a.example", folderPath: [], tags: [] });
  });

  it("falls back to the link for a missing title, and to 'now' for a missing or bad date", () => {
    const r = parseServiceCsv("url,created\nhttps://a.example,not a date\n", NOW)!;
    expect(r.bookmarks[0].title).toBe("https://a.example");
    expect(r.bookmarks[0].createdAt).toBe(NOW.toISOString());
  });

  it("reads millisecond timestamps", () => {
    const r = parseServiceCsv("url,created\nhttps://a.example,1700000000000\n", NOW)!;
    expect(r.bookmarks[0].createdAt).toBe(new Date(1700000000000).toISOString());
  });

  it("is not a link list without a url column", () => {
    expect(parseServiceCsv("name,age\nA,3\n", NOW)).toBeNull();
    expect(parseServiceCsv("", NOW)).toBeNull();
  });

  // Unsafe links are dropped later, in planBookmarkImport; the parser's own job
  // is only to ignore a cell that is not a link at all.
  it("skips a row whose 'url' is not a link", () => {
    const r = parseServiceCsv("url\nnot a link\nhttps://ok.example\n", NOW)!;
    expect(r.bookmarks.map((b) => b.url)).toEqual(["https://ok.example"]);
    expect(r.skipped).toBe(1);
  });
});
