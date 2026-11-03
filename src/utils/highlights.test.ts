import { describe, expect, it } from "vitest";

import {
  MAX_HIGHLIGHTS,
  MAX_HIGHLIGHT_CHARS,
  addHighlight,
  cleanHighlightText,
  cleanHighlights,
  removeHighlight,
} from "@/utils/highlights";

const NOW = "2026-01-01T00:00:00.000Z";

describe("cleanHighlightText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanHighlightText("  a   quiet \n part  ")).toBe("a quiet part");
  });
  it("caps the length", () => {
    expect(cleanHighlightText("w".repeat(MAX_HIGHLIGHT_CHARS + 50))).toHaveLength(MAX_HIGHLIGHT_CHARS);
  });
});

describe("addHighlight", () => {
  it("appends, newest last, stored in its cleaned form", () => {
    const first = addHighlight(undefined, "  hello   world ", NOW, "a");
    expect(first).toEqual({
      ok: true,
      highlights: [{ id: "a", text: "hello world", createdAt: NOW }],
      added: { id: "a", text: "hello world", createdAt: NOW },
    });
    const second = addHighlight(first.ok ? first.highlights : [], "another passage", NOW, "b");
    expect(second.ok && second.highlights.map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("refuses a too-short, repeated or over-limit passage", () => {
    expect(addHighlight([], "ab")).toEqual({ ok: false, reason: "too_short" });
    expect(addHighlight([{ id: "a", text: "hello world", createdAt: NOW }], "hello   world")).toEqual({
      ok: false,
      reason: "duplicate",
    });
    const full = Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => ({ id: `${i}`, text: `passage ${i}`, createdAt: NOW }));
    expect(addHighlight(full, "one more passage")).toEqual({ ok: false, reason: "full" });
  });
});

describe("removeHighlight", () => {
  it("removes by id, and returns undefined when none are left", () => {
    const list = [{ id: "a", text: "first one", createdAt: NOW }, { id: "b", text: "second one", createdAt: NOW }];
    expect(removeHighlight(list, "a")?.map((h) => h.id)).toEqual(["b"]);
    expect(removeHighlight([list[0]], "a")).toBeUndefined();
    expect(removeHighlight(undefined, "a")).toBeUndefined();
  });
});

describe("cleanHighlights (what a stored or imported value really is)", () => {
  it("keeps valid entries, fills a missing id/date, drops junk and repeats", () => {
    const out = cleanHighlights([
      { id: "a", text: "keep this", createdAt: NOW },
      { text: "  no id  or date " },
      { id: "c", text: "keep this" }, // repeat
      { id: "d", text: "x" }, // too short
      { id: "e", text: 42 },
      null,
      "string",
    ]);
    expect(out?.map((h) => h.text)).toEqual(["keep this", "no id or date"]);
    expect(out?.[1].id).toBeTruthy();
    expect(out?.[1].createdAt).toBeTruthy();
  });

  it("is undefined for a non-array or nothing usable, and caps the count", () => {
    expect(cleanHighlights(undefined)).toBeUndefined();
    expect(cleanHighlights("nope")).toBeUndefined();
    expect(cleanHighlights([{ text: "x" }])).toBeUndefined();
    const many = Array.from({ length: MAX_HIGHLIGHTS + 20 }, (_, i) => ({ text: `passage number ${i}` }));
    expect(cleanHighlights(many)).toHaveLength(MAX_HIGHLIGHTS);
  });
});
