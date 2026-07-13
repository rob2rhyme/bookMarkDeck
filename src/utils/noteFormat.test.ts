import { describe, expect, it } from "vitest";

import {
  appendBullet,
  appendNumber,
  continueListOnEnter,
  hasBullets,
  hasNumberedList,
  noteChecklistItems,
  setNoteItemChecked,
  toChecklistBlocks,
  toNoteBlocks,
} from "@/utils/noteFormat";

describe("hasBullets", () => {
  it("detects -, *, • bullet lines", () => {
    expect(hasBullets("- a")).toBe(true);
    expect(hasBullets("* a")).toBe(true);
    expect(hasBullets("• a")).toBe(true);
    expect(hasBullets("  - indented")).toBe(true);
  });
  it("ignores non-bullets and dashes without a space", () => {
    expect(hasBullets("plain")).toBe(false);
    expect(hasBullets("-nospace")).toBe(false);
    expect(hasBullets("a - b")).toBe(false); // dash mid-line
  });
});

describe("toNoteBlocks", () => {
  it("returns a single text block when there are no bullets", () => {
    expect(toNoteBlocks("hello\nworld")).toEqual([
      { type: "text", text: "hello\nworld" },
    ]);
  });

  it("groups consecutive bullet lines into one list", () => {
    expect(toNoteBlocks("- a\n- b\n* c")).toEqual([
      { type: "list", items: ["a", "b", "c"] },
    ]);
  });

  it("interleaves text and lists in order", () => {
    expect(toNoteBlocks("Intro\n- one\n- two\nOutro")).toEqual([
      { type: "text", text: "Intro" },
      { type: "list", items: ["one", "two"] },
      { type: "text", text: "Outro" },
    ]);
  });
});

describe("appendBullet", () => {
  it("seeds the first bullet on empty text", () => {
    expect(appendBullet("")).toBe("- ");
  });
  it("starts a new bullet line after content", () => {
    expect(appendBullet("hi")).toBe("hi\n- ");
  });
  it("does not add a blank line when text already ends in newline", () => {
    expect(appendBullet("hi\n")).toBe("hi\n- ");
  });
});

describe("hasNumberedList", () => {
  it("detects 1. and 2) numbered lines", () => {
    expect(hasNumberedList("1. a")).toBe(true);
    expect(hasNumberedList("2) b")).toBe(true);
    expect(hasNumberedList("  3. indented")).toBe(true);
  });
  it("ignores plain text and numbers without a separator+space", () => {
    expect(hasNumberedList("plain")).toBe(false);
    expect(hasNumberedList("1.nospace")).toBe(false);
    expect(hasNumberedList("step 1. do it")).toBe(false);
  });
});

describe("toNoteBlocks (numbered)", () => {
  it("groups consecutive numbered lines into one ordered list", () => {
    expect(toNoteBlocks("1. a\n2. b\n3) c")).toEqual([
      { type: "ordered", items: ["a", "b", "c"] },
    ]);
  });
  it("keeps bullet and numbered lists as separate blocks", () => {
    expect(toNoteBlocks("- a\n1. b")).toEqual([
      { type: "list", items: ["a"] },
      { type: "ordered", items: ["b"] },
    ]);
  });
});

describe("appendNumber", () => {
  it("seeds the first item on empty text", () => {
    expect(appendNumber("")).toBe("1. ");
  });
  it("starts a numbered line after plain content", () => {
    expect(appendNumber("hi")).toBe("hi\n1. ");
  });
  it("continues the trailing numbered run", () => {
    expect(appendNumber("1. a")).toBe("1. a\n2. ");
    expect(appendNumber("1. a\n2. b")).toBe("1. a\n2. b\n3. ");
  });
  it("does not add a blank line when text already ends in newline", () => {
    expect(appendNumber("1. a\n")).toBe("1. a\n2. ");
  });
});

describe("continueListOnEnter", () => {
  it("returns null off a list line (default newline applies)", () => {
    expect(continueListOnEnter("plain text", 10)).toBeNull();
    expect(continueListOnEnter("", 0)).toBeNull();
  });
  it("continues a bullet list with the same marker", () => {
    expect(continueListOnEnter("- a", 3)).toEqual({ text: "- a\n- ", caret: 6 });
    expect(continueListOnEnter("* a", 3)).toEqual({ text: "* a\n* ", caret: 6 });
  });
  it("continues a numbered list with the next ordinal", () => {
    expect(continueListOnEnter("1. a", 4)).toEqual({ text: "1. a\n2. ", caret: 8 });
    expect(continueListOnEnter("3) c", 4)).toEqual({ text: "3) c\n4) ", caret: 8 });
  });
  it("keeps the indent of the current item", () => {
    expect(continueListOnEnter("  - a", 5)).toEqual({
      text: "  - a\n  - ",
      caret: 10,
    });
  });
  it("splits mid-line, moving the tail onto the new item", () => {
    expect(continueListOnEnter("- ab", 3)).toEqual({ text: "- a\n- b", caret: 6 });
  });
  it("ends list mode on an empty item (removes the prefix)", () => {
    expect(continueListOnEnter("- a\n- ", 6)).toEqual({ text: "- a\n", caret: 4 });
    expect(continueListOnEnter("1. a\n2. ", 8)).toEqual({ text: "1. a\n", caret: 5 });
  });
  it("ends list mode on an empty checked item too", () => {
    expect(continueListOnEnter("- [x] ", 6)).toEqual({ text: "", caret: 0 });
  });
  it("returns null when the caret sits inside the marker/indent", () => {
    expect(continueListOnEnter("- a", 0)).toBeNull();
    expect(continueListOnEnter("- a", 1)).toBeNull();
    expect(continueListOnEnter("x\n- a", 2)).toBeNull();
    expect(continueListOnEnter("2. b", 1)).toBeNull();
  });
  it("works on a list line above trailing text", () => {
    expect(continueListOnEnter("- a\ntail", 3)).toEqual({
      text: "- a\n- \ntail",
      caret: 6,
    });
  });
});

describe("checklists", () => {
  it("parses list lines into items with checked state", () => {
    expect(noteChecklistItems("intro\n- a\n- [x] b\n1. [ ] c")).toEqual([
      { text: "a", checked: false, line: 1 },
      { text: "b", checked: true, line: 2 },
      { text: "c", checked: false, line: 3 },
    ]);
  });
  it("returns no items for a plain note", () => {
    expect(noteChecklistItems("just text")).toEqual([]);
  });
  it("ignores prefix-only lines (no phantom items)", () => {
    expect(noteChecklistItems("- a\n- ")).toEqual([
      { text: "a", checked: false, line: 0 },
    ]);
    expect(noteChecklistItems("- ")).toEqual([]);
  });
  it("keeps text and item runs in order", () => {
    expect(toChecklistBlocks("Intro\n- a\nOutro")).toEqual([
      { type: "text", text: "Intro" },
      { type: "items", items: [{ text: "a", checked: false, line: 1 }] },
      { type: "text", text: "Outro" },
    ]);
  });
  it("checks and unchecks an item in place", () => {
    expect(setNoteItemChecked("- a\n- b", 1, true)).toBe("- a\n- [x] b");
    expect(setNoteItemChecked("- a\n- [x] b", 1, false)).toBe("- a\n- b");
    expect(setNoteItemChecked("1. a", 0, true)).toBe("1. [x] a");
  });
  it("leaves non-list lines untouched", () => {
    expect(setNoteItemChecked("plain\n- a", 0, true)).toBe("plain\n- a");
    expect(setNoteItemChecked("- a", 5, true)).toBe("- a");
  });
});
