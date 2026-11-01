import { describe, expect, it } from "vitest";

import type { Note } from "./notes";
import { findRanges, parseQuery, searchNotes, type Highlighted } from "./search";

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: "",
  body: "",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

// Render highlighted text as "a[b]c" to make ranges readable.
const mark = ({ text, ranges }: Highlighted) => {
  let out = "";
  let last = 0;
  for (const [s, e] of ranges) {
    out += text.slice(last, s) + "[" + text.slice(s, e) + "]";
    last = e;
  }
  return out + text.slice(last);
};

const ids = (hits: { note: Note }[]) => hits.map((h) => h.note.id);

describe("parseQuery", () => {
  it("splits words, keeps quoted phrases whole and pulls out #tags", () => {
    expect(parseQuery(' Milk "ice Cream"  #Work #work x')).toEqual({ terms: ["milk", "ice cream", "x"], tags: ["work"] });
  });

  it("a lone # is a word, and accents fold", () => {
    expect(parseQuery("# Café")).toEqual({ terms: ["#", "cafe"], tags: [] });
  });
});

describe("findRanges", () => {
  it("finds every occurrence of every term, merged", () => {
    expect(mark({ text: "banana band", ranges: findRanges("banana band", ["ban", "an"]) })).toBe("[banan]a [ban]d");
  });

  it("maps folded matches back onto the original text", () => {
    const text = "Crème brûlée café";
    expect(mark({ text, ranges: findRanges(text, ["creme", "cafe"]) })).toBe("[Crème] brûlée [café]");
  });

  it("survives a fold that changes length", () => {
    // "İ" lowercases to two code units; the range must still cover exactly it.
    const text = "İstanbul trip";
    expect(mark({ text, ranges: findRanges(text, ["trip"]) })).toBe("İstanbul [trip]");
  });
});

describe("searchNotes", () => {
  const notes = [
    note("pinned", { pinned: true, title: "Groceries", body: "milk\neggs", tags: ["home"] }),
    note("body", { title: "Weekend", body: "buy milk on the way back", tags: [] }),
    note("title", { title: "Milk prices", body: "compare stores", tags: ["money"] }),
    note("tagged", { title: "Ideas", body: "nothing here", tags: ["milk-run"] }),
  ];

  it("returns every note, in order, when the search is empty", () => {
    expect(ids(searchNotes(notes, "  "))).toEqual(["pinned", "body", "title", "tagged"]);
  });

  it("ranks title over tag over body, keeping display order on ties", () => {
    expect(ids(searchNotes(notes, "milk"))).toEqual(["title", "tagged", "pinned", "body"]);
  });

  it("requires every word, in any order", () => {
    expect(ids(searchNotes(notes, "back milk"))).toEqual(["body"]);
    expect(ids(searchNotes(notes, "milk zebra"))).toEqual([]);
  });

  it("filters by #tag in the query and by the selected tag", () => {
    expect(ids(searchNotes(notes, "#home"))).toEqual(["pinned"]);
    expect(ids(searchNotes(notes, "milk", "money"))).toEqual(["title"]);
    expect(ids(searchNotes(notes, "", "home"))).toEqual(["pinned"]);
  });

  it("highlights the title and shows the body line that matched", () => {
    const [hit] = searchNotes(notes, "eggs");
    expect(mark(hit.title)).toBe("Groceries");
    expect(mark(hit.preview)).toBe("[eggs]");
  });

  it("windows a long line around the match", () => {
    const body = "word ".repeat(30) + "needle " + "tail ".repeat(60);
    const [hit] = searchNotes([note("n", { title: "T", body })], "needle");
    expect(hit.preview.text.startsWith("…")).toBe(true);
    expect(hit.preview.text.endsWith("…")).toBe(true);
    expect(hit.preview.text.length).toBeLessThanOrEqual(162);
    expect(mark(hit.preview)).toContain("[needle]");
  });

  it("an untitled note's snippet skips the line already shown as its title", () => {
    const [hit] = searchNotes([note("u", { body: "milk run\nmore milk later" })], "milk");
    expect(mark(hit.title)).toBe("[milk] run");
    expect(mark(hit.preview)).toBe("more [milk] later");
  });

  it("falls back to the first line when only the title or a tag matched", () => {
    const [hit] = searchNotes(notes, "prices");
    expect(mark(hit.title)).toBe("Milk [prices]");
    expect(mark(hit.preview)).toBe("compare stores");
  });

  it("matches the text as read, not its markdown", () => {
    const [hit] = searchNotes([note("m", { title: "Shop", body: "- [ ] buy **oat** milk\n[docs](https://x.dev)" })], "oat milk");
    expect(mark(hit.preview)).toBe("☐ buy [oat] [milk]");
    expect(searchNotes([note("u", { title: "T", body: "see https://x.dev" })], "x.dev")).toHaveLength(1);
    expect(searchNotes([note("v", { title: "T", body: "[label](https://hidden.dev)" })], "hidden")).toHaveLength(0);
  });
});
