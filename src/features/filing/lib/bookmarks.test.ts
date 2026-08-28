import { describe, expect, it } from "vitest";

import {
  bookmarksKey,
  displayHost,
  normalizeBookmarks,
  searchBookmarks,
  suggestForTitle,
  type LinkableBookmark,
} from "@/features/filing/lib/bookmarks";

const bm = (id: string, title: string, url: string): LinkableBookmark => ({ id, title, url });

describe("bookmarksKey", () => {
  it("matches the core hook's per-user key", () => {
    expect(bookmarksKey("a@b.com")).toBe("bookmarkdeck:v2:a@b.com");
    expect(bookmarksKey(null)).toBe("bookmarkdeck:v2");
  });
});

describe("normalizeBookmarks", () => {
  it("keeps only records that can be opened", () => {
    const out = normalizeBookmarks([
      { id: "1", title: "GEICO", url: "https://geico.com" },
      { id: "2", title: "No url" },
      { title: "No id", url: "https://x.com" },
      { id: "3", url: "https://untitled.com" },
      null,
      "nope",
    ]);
    expect(out.map((b) => b.id)).toEqual(["1", "3"]);
  });

  it("falls back to the url when a bookmark has no usable title", () => {
    expect(normalizeBookmarks([{ id: "3", url: "https://untitled.com" }])[0].title).toBe(
      "https://untitled.com"
    );
    expect(normalizeBookmarks([{ id: "4", title: "   ", url: "https://x.com" }])[0].title).toBe(
      "https://x.com"
    );
  });

  it("drops duplicate ids, keeping the first", () => {
    const out = normalizeBookmarks([
      { id: "1", title: "First", url: "https://a.com" },
      { id: "1", title: "Second", url: "https://b.com" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("First");
  });

  it("returns [] for anything that isn't an array", () => {
    expect(normalizeBookmarks(undefined)).toEqual([]);
    expect(normalizeBookmarks({})).toEqual([]);
  });
});

describe("displayHost", () => {
  it("strips scheme, www and path", () => {
    expect(displayHost("https://www.geico.com/login?a=1")).toBe("geico.com");
    expect(displayHost("http://portal.aetna.com/x")).toBe("portal.aetna.com");
  });

  it("degrades rather than throwing on a malformed url", () => {
    expect(displayHost("not a url")).toBe("not a url");
  });
});

describe("searchBookmarks", () => {
  const list = [
    bm("1", "GEICO auto insurance", "https://geico.com"),
    bm("2", "Aetna member portal", "https://aetna.com"),
    bm("3", "Notes about geico claims", "https://notes.example.com"),
    bm("4", "IRS", "https://irs.gov"),
  ];

  it("returns everything, capped, for an empty query", () => {
    expect(searchBookmarks(list, "").map((b) => b.id)).toEqual(["1", "2", "3", "4"]);
    expect(searchBookmarks(list, "  ", 2)).toHaveLength(2);
  });

  it("ranks a title prefix above a mention in the middle", () => {
    // Typing "geico" should offer the insurer, not a note that mentions it.
    expect(searchBookmarks(list, "geico").map((b) => b.id)).toEqual(["1", "3"]);
  });

  it("scores an exact title match highest", () => {
    expect(searchBookmarks(list, "IRS")[0].id).toBe("4");
  });

  it("matches on host when the title doesn't mention it", () => {
    expect(searchBookmarks([bm("9", "Member portal", "https://aetna.com")], "aetna")[0].id).toBe("9");
  });

  it("is case insensitive", () => {
    expect(searchBookmarks(list, "GEICO")[0].id).toBe("1");
    expect(searchBookmarks(list, "geico")[0].id).toBe("1");
  });

  it("returns nothing when nothing matches", () => {
    expect(searchBookmarks(list, "zzzz")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchBookmarks(list, "e", 1)).toHaveLength(1);
  });
});

describe("suggestForTitle", () => {
  const list = [
    bm("1", "GEICO auto insurance", "https://geico.com"),
    bm("2", "Aetna member portal", "https://aetna.com"),
  ];

  it("suggests on a confident single hit", () => {
    expect(suggestForTitle(list, "GEICO policy 2026")?.id).toBe("1");
  });

  it("stays silent when a word is ambiguous", () => {
    const ambiguous = [
      bm("1", "Insurance one", "https://a.com"),
      bm("2", "Insurance two", "https://b.com"),
    ];
    expect(suggestForTitle(ambiguous, "Insurance policy")).toBeNull();
  });

  it("ignores short words, which match noise", () => {
    // "tax" is 3 letters; matching it against every bookmark would be worse
    // than not suggesting at all.
    expect(suggestForTitle([bm("1", "Tax stuff", "https://t.com")], "tax")).toBeNull();
  });

  it("returns null when there's nothing to match", () => {
    expect(suggestForTitle([], "GEICO policy")).toBeNull();
    expect(suggestForTitle(list, "")).toBeNull();
  });
});
