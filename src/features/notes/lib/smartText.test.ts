import { describe, expect, it } from "vitest";

import {
  continueList,
  cycleHeading,
  insertLink,
  toggleBullets,
  toggleLinePrefix,
  wrapInline,
  indentLines,
  parseMarker,
  tabIndents,
  toggleChecklist,
  type TextEdit,
} from "./smartText";

// Write the caret as "|" (or a selection as "«…»") inside the text.
function at(src: string): { value: string; start: number; end: number } {
  if (src.includes("«")) {
    const start = src.indexOf("«");
    const value = src.replace("«", "").replace("»", "");
    return { value, start, end: src.indexOf("»") - 1 };
  }
  const i = src.indexOf("|");
  return { value: src.replace("|", ""), start: i, end: i };
}

// Apply an edit and render the result with its caret/selection marked the same way.
function show(value: string, e: TextEdit | null): string | null {
  if (!e) return null;
  const v = value.slice(0, e.from) + e.insert + value.slice(e.to);
  if (e.selStart === e.selEnd) return v.slice(0, e.selStart) + "|" + v.slice(e.selStart);
  return v.slice(0, e.selStart) + "«" + v.slice(e.selStart, e.selEnd) + "»" + v.slice(e.selEnd);
}

const enter = (src: string) => {
  const { value, start, end } = at(src);
  return show(value, continueList(value, start, end));
};

describe("parseMarker", () => {
  it.each([
    ["- milk", { bullet: "-", num: null, checked: null, length: 2 }],
    ["  * eggs", { bullet: "*", indent: "  ", length: 4 }],
    ["• tea", { bullet: "•" }],
    ["12. twelve", { num: 12, delim: "." }],
    ["3) three", { num: 3, delim: ")" }],
    ["- [ ] todo", { bullet: "-", checked: false, length: 6 }],
    ["- [x] done", { checked: true }],
    ["1. [X] done", { num: 1, checked: true }],
    ["[ ] bare", { bullet: null, num: null, checked: false, length: 4 }],
    ["- [ ]", { checked: false, length: 5 }],
  ])("%s", (line, expected) => {
    expect(parseMarker(line)).toMatchObject(expected);
  });

  it.each(["plain text", "-no space", "1.5 kg", "---", "", "[link](x)"])("not a list: %s", (line) => {
    expect(parseMarker(line)).toBeNull();
  });
});

describe("continueList — Enter", () => {
  it("continues a bullet", () => {
    expect(enter("- milk|")).toBe("- milk\n- |");
  });

  it("keeps the indent and bullet character", () => {
    expect(enter("  • eggs|")).toBe("  • eggs\n  • |");
  });

  it("increments a numbered item", () => {
    expect(enter("1. one|")).toBe("1. one\n2. |");
    expect(enter("9) nine|")).toBe("9) nine\n10) |");
  });

  it("renumbers the items below when inserting in the middle", () => {
    expect(enter("1. a|\n2. b\n3. c\nafter")).toBe("1. a\n2. |\n3. b\n4. c\nafter");
  });

  it("renumbering skips nested lines and stops at a shallower or different line", () => {
    expect(enter("1. a|\n2. b\n   - sub\n3. c\n\n1. new list")).toBe(
      "1. a\n2. |\n3. b\n   - sub\n4. c\n\n1. new list"
    );
  });

  it("adds an UNticked checkbox after any checkbox", () => {
    expect(enter("- [x] done|")).toBe("- [x] done\n- [ ] |");
    expect(enter("[ ] bare|")).toBe("[ ] bare\n[ ] |");
  });

  it("splits an item when the caret is mid-text", () => {
    expect(enter("- milk| and eggs")).toBe("- milk\n- | and eggs");
  });

  it("ends the list on an empty item", () => {
    expect(enter("- a\n- |")).toBe("- a\n|");
    expect(enter("- a\n- [ ] |")).toBe("- a\n|");
    expect(enter("1. a\n2. |")).toBe("1. a\n|");
  });

  it("outdents an empty NESTED item before ending the list", () => {
    expect(enter("- a\n    - |")).toBe("- a\n  - |");
  });

  it("does nothing outside a list, inside the marker, or with a selection", () => {
    expect(enter("plain|")).toBeNull();
    expect(enter("-| milk")).toBeNull();
    expect(enter("- «mil»k")).toBeNull();
  });
});

describe("indentLines — Tab / Shift+Tab", () => {
  const tab = (src: string, out = false) => {
    const { value, start, end } = at(src);
    return show(value, indentLines(value, start, end, out));
  };

  it("indents the caret's line and keeps the caret in its text", () => {
    expect(tab("- a|")).toBe("  - a|");
  });

  it("indents every line a selection touches, keeping the selection", () => {
    expect(tab("- «a\n- b»\n- c")).toBe("  - «a\n  - b»\n- c");
  });

  it("a selection ending at the start of a line doesn't touch that line", () => {
    expect(tab("«- a\n»- b")).toBe("  «- a\n»- b");
  });

  it("outdents by up to two spaces or one tab", () => {
    expect(tab("    - a|", true)).toBe("  - a|");
    expect(tab(" - a|", true)).toBe("- a|");
    expect(tab("\t- a|", true)).toBe("- a|");
  });

  it("returns null when there is nothing to outdent", () => {
    expect(tab("- a|", true)).toBeNull();
  });

  it("moves a caret inside the removed indent to the line start", () => {
    expect(tab(" | - a", true)).toBe("|- a");
  });
});

describe("tabIndents", () => {
  it("captures Tab on list lines and multi-line selections only", () => {
    const t = (src: string) => {
      const { value, start, end } = at(src);
      return tabIndents(value, start, end);
    };
    expect(t("- a|")).toBe(true);
    expect(t("«a\nb»")).toBe(true);
    expect(t("plain|")).toBe(false);
  });
});

describe("toggleChecklist — ⌘/Ctrl+Enter", () => {
  const toggle = (src: string) => {
    const { value, start, end } = at(src);
    return show(value, toggleChecklist(value, start, end));
  };

  it("ticks and unticks", () => {
    expect(toggle("- [ ] milk|")).toBe("- [x] milk|");
    expect(toggle("- [x] milk|")).toBe("- [ ] milk|");
    expect(toggle("  [X] bare|")).toBe("  [ ] bare|");
  });

  it("adds a checkbox to a list item", () => {
    expect(toggle("1. call|")).toBe("1. [ ] call|");
  });

  it("turns a plain line into a checklist item", () => {
    expect(toggle("  buy| milk")).toBe("  - [ ] buy| milk");
  });

  it("applies to each selected line", () => {
    expect(toggle("«- [ ] a\nb»")).toBe("«- [x] a\n- [ ] b»");
  });
});

describe("formatting", () => {
  const run = (src: string, fn: (v: string, s: number, e: number) => TextEdit | null) => {
    const { value, start, end } = at(src);
    return show(value, fn(value, start, end));
  };
  const bold = (v: string, s: number, e: number) => wrapInline(v, s, e, "**");

  it("wraps and unwraps a selection", () => {
    expect(run("a «word» b", bold)).toBe("a **«word»** b");
    expect(run("a **«word»** b", bold)).toBe("a «word» b");
    expect(run("a «**word**» b", bold)).toBe("a «word» b");
  });

  it("keeps surrounding spaces outside the markers", () => {
    expect(run("«word »next", bold)).toBe("**«word»** next");
  });

  it("inserts an empty pair around the caret", () => {
    expect(run("a | b", (v, s, e) => wrapInline(v, s, e, "`"))).toBe("a `|` b");
  });

  it("cycles headings on the touched lines", () => {
    expect(run("Title|", cycleHeading)).toBe("# Title|");
    expect(run("# Title|", cycleHeading)).toBe("## Title|");
    expect(run("### Title|", cycleHeading)).toBe("Title|");
  });

  it("toggles a quote prefix across lines, ignoring blank ones", () => {
    const quote = (v: string, s: number, e: number) => toggleLinePrefix(v, s, e, "> ");
    expect(run("«a\n\nb»", quote)).toBe("> «a\n\n> b»");
    expect(run("«> a\n> b»", quote)).toBe("«a\nb»");
  });

  it("toggles bullets, leaving existing list lines alone when adding", () => {
    expect(run("«a\n- b»", toggleBullets)).toBe("- «a\n- b»");
    expect(run("«- a\n1. b»", toggleBullets)).toBe("«a\nb»");
    expect(run("  indented|", toggleBullets)).toBe("  - indented|");
  });

  it("makes links: text becomes the label, a URL becomes the address", () => {
    expect(run("see «docs»", insertLink)).toBe("see [docs](«https://»)");
    expect(run("«https://x.dev»", insertLink)).toBe("[|](https://x.dev)");
    expect(run("|", insertLink)).toBe("[«link»](https://)");
  });
});
