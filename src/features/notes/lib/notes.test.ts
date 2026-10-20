import { describe, expect, it } from "vitest";

import { cardText, countWords, editedAgo, isBlank, newNote, normalizeNote, sortNotes, type Note } from "./notes";

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: "",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("sortNotes", () => {
  it("puts pinned notes first, then the most recently edited", () => {
    const list = [
      note("old", { updatedAt: "2026-01-01T00:00:00.000Z" }),
      note("new", { updatedAt: "2026-03-01T00:00:00.000Z" }),
      note("pinnedOld", { pinned: true, updatedAt: "2025-01-01T00:00:00.000Z" }),
      note("pinnedNew", { pinned: true, updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(sortNotes(list).map((n) => n.id)).toEqual(["pinnedNew", "pinnedOld", "new", "old"]);
  });

  it("is total — ties fall back to createdAt, then id — and doesn't mutate its input", () => {
    const a = note("a");
    const b = note("b", { createdAt: "2026-02-01T00:00:00.000Z" });
    const c = note("c");
    const input = [c, a, b];
    expect(sortNotes(input).map((n) => n.id)).toEqual(["b", "a", "c"]);
    expect(input.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });
});

describe("cardText", () => {
  it("shows the title and the body's first non-empty line", () => {
    expect(cardText({ title: "Groceries", body: "\n\n  milk\neggs" })).toEqual({ title: "Groceries", preview: "milk" });
  });

  it("titles an untitled note by its first line and previews the next", () => {
    expect(cardText({ title: " ", body: "Pasted heading\nsecond" })).toEqual({ title: "Pasted heading", preview: "second" });
  });

  it("falls back to Untitled", () => {
    expect(cardText({ title: "", body: "" })).toEqual({ title: "Untitled", preview: "" });
  });
});

describe("normalizeNote", () => {
  it("rejects records without an id", () => {
    expect(normalizeNote({ title: "x" })).toBeNull();
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNote("nope")).toBeNull();
  });

  it("coerces bad fields instead of crashing", () => {
    expect(
      normalizeNote({ id: "n1", title: 5, body: null, pinned: "yes", tags: ["a", 3, ""], createdAt: "bad" })
    ).toEqual({
      id: "n1",
      title: "",
      body: "",
      pinned: false,
      tags: ["a"],
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("defaults updatedAt to createdAt", () => {
    expect(normalizeNote({ id: "n", createdAt: "2026-05-01T10:00:00.000Z" })?.updatedAt).toBe("2026-05-01T10:00:00.000Z");
  });
});

describe("newNote / isBlank / countWords", () => {
  it("creates an empty, unpinned note stamped now", () => {
    const n = newNote({ body: "hi" }, new Date("2026-10-20T12:00:00.000Z"));
    expect(n).toMatchObject({ title: "", body: "hi", pinned: false, tags: [], createdAt: "2026-10-20T12:00:00.000Z" });
    expect(n.updatedAt).toBe(n.createdAt);
    expect(n.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("whitespace is blank", () => {
    expect(isBlank({ title: " ", body: "\n\t" })).toBe(true);
    expect(isBlank({ title: "", body: "x" })).toBe(false);
  });

  it("counts words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one two\nthree  ")).toBe(3);
  });
});

describe("editedAgo", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  it.each([
    ["2026-10-20T11:59:30.000Z", "just now"],
    ["2026-10-20T11:55:00.000Z", "5m ago"],
    ["2026-10-20T09:00:00.000Z", "3h ago"],
    ["2026-10-18T12:00:00.000Z", "2d ago"],
    ["not a date", ""],
  ])("%s → %s", (iso, label) => {
    expect(editedAgo(iso, now)).toBe(label);
  });

  it("uses a short date past a week", () => {
    expect(editedAgo("2026-09-01T12:00:00.000Z", now)).toMatch(/Sep|9/);
  });
});
