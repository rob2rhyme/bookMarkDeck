import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown, safeHref, toPlainText, toggleTaskLine, type Block, type Inline } from "./markdown";

// Compact rendering of inline nodes for readable assertions.
const show = (nodes: Inline[]): string =>
  nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.text;
        case "br":
          return "⏎";
        case "code":
          return `<code>${n.text}</code>`;
        case "link":
          return `<a ${n.href}>${show(n.children)}</a>`;
        default:
          return `<${n.type}>${show(n.children)}</${n.type}>`;
      }
    })
    .join("");
const inl = (s: string) => show(parseInline(s));
const types = (b: Block[]) => b.map((x) => x.type);

describe("parseInline", () => {
  it.each([
    ["**bold** and *em* and _em_ and ~~gone~~", "<strong>bold</strong> and <em>em</em> and <em>em</em> and <del>gone</del>"],
    ["*a **b** c*", "<em>a <strong>b</strong> c</em>"],
    ["`a*b*c`", "<code>a*b*c</code>"],
    ["``a ` b``", "<code>a ` b</code>"],
    ["snake_case_name", "snake_case_name"],
    ["2 * 3 * 4", "2 * 3 * 4"],
    ["\\*not em\\*", "*not em*"],
    ["a\nb", "a⏎b"],
    ["~single~", "~single~"],
    ["**unclosed", "**unclosed"],
  ])("%s", (src, out) => {
    expect(inl(src)).toBe(out);
  });

  it("links: markdown, bare URLs and www., trimming trailing punctuation", () => {
    expect(inl("see [the docs](https://x.dev/a?b=1) now")).toBe("see <a https://x.dev/a?b=1>the docs</a> now");
    expect(inl("go to https://x.dev/path, then")).toBe("go to <a https://x.dev/path>https://x.dev/path</a>, then");
    expect(inl("(www.x.dev)")).toBe("(<a https://www.x.dev>www.x.dev</a>)");
    expect(inl("mail [me](mailto:a@b.c)")).toBe("mail <a mailto:a@b.c>me</a>");
  });

  it("never renders a script-capable link — it stays text", () => {
    expect(inl("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
    expect(inl("[x](data:text/html,<script>)")).toBe("[x](data:text/html,<script>)");
    expect(safeHref(" JavaScript:alert(1)")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
  });

  it("raw HTML is just text", () => {
    expect(inl('<img src=x onerror="alert(1)">')).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("parseMarkdown — blocks", () => {
  it("headings, paragraphs, rules, quotes and fenced code", () => {
    const b = parseMarkdown("# Title\n\nline one\nline two\n\n---\n> quoted\n> more\n\n```js\nconst a = 1;\n```");
    expect(types(b)).toEqual(["heading", "paragraph", "hr", "quote", "code"]);
    expect(b[0]).toMatchObject({ level: 1 });
    expect(show((b[1] as { children: Inline[] }).children)).toBe("line one⏎line two");
    expect(b[4]).toEqual({ type: "code", lang: "js", text: "const a = 1;" });
  });

  it("an unclosed fence runs to the end; '#tag' is not a heading", () => {
    expect(parseMarkdown("```\ncode")).toEqual([{ type: "code", lang: "", text: "code" }]);
    expect(types(parseMarkdown("#tag here"))).toEqual(["paragraph"]);
  });

  it("nested lists with tasks remember their source lines", () => {
    const [list] = parseMarkdown("- [ ] buy\n  - [x] milk\n  - eggs\n- call mum") as Extract<Block, { type: "list" }>[];
    expect(list.ordered).toBe(false);
    expect(list.items.map((i) => [i.checked, i.line])).toEqual([[false, 0], [null, 3]]);
    const nested = list.items[0].children[1] as Extract<Block, { type: "list" }>;
    expect(nested.items.map((i) => [i.checked, i.line])).toEqual([[true, 1], [null, 2]]);
  });

  it("a bare '[ ] x' line is a task, as the editor writes it", () => {
    const [list] = parseMarkdown("[ ] call\n[x] done") as Extract<Block, { type: "list" }>[];
    expect(list.items.map((i) => [i.checked, i.line])).toEqual([[false, 0], [true, 1]]);
    expect(toggleTaskLine("[ ] call", 0)).toBe("[x] call");
    expect(toPlainText("[ ] call")).toBe("☐ call");
  });

  it("numbered lists keep their start; a change of marker starts a new list", () => {
    const b = parseMarkdown("3. c\n4. d\n- x");
    expect(b).toMatchObject([{ type: "list", ordered: true, start: 3 }, { type: "list", ordered: false }]);
  });

  it("a blank line inside a list only continues it when indented content follows", () => {
    expect(types(parseMarkdown("- a\n\n  more of a\n- b"))).toEqual(["list"]);
    expect(types(parseMarkdown("- a\n\nafter"))).toEqual(["list", "paragraph"]);
  });

  it("pipe tables with alignment and escaped pipes", () => {
    const [t] = parseMarkdown("| A | B |\n|:--|--:|\n| 1 | x \\| y |\n| 2 |") as Extract<Block, { type: "table" }>[];
    expect(t.align).toEqual(["left", "right"]);
    expect(t.head.map(show)).toEqual(["A", "B"]);
    expect(t.rows.map((r) => r.map(show))).toEqual([["1", "x | y"], ["2", ""]]);
  });
});

describe("toPlainText", () => {
  it("drops the syntax but keeps the line structure", () => {
    expect(toPlainText("# Plan\n- [x] **ship** it\n- [ ] [docs](https://x.dev)\n1. one\n> quote\n---\n`code`")).toBe(
      "Plan\n☑ ship it\n☐ docs\n1. one\nquote\n\ncode"
    );
  });

  it("drops fence lines but keeps the code", () => {
    expect(toPlainText("a\n```js\nx = 1\n```\nb")).toBe("a\nx = 1\nb");
  });

  it("flattens a table row", () => {
    expect(toPlainText("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a · b\n\n1 · 2");
  });
});

describe("toggleTaskLine", () => {
  it("ticks and unticks only the given line", () => {
    const src = "- [ ] a\n  1. [x] b\nplain";
    expect(toggleTaskLine(src, 0)).toBe("- [x] a\n  1. [x] b\nplain");
    expect(toggleTaskLine(src, 1)).toBe("- [ ] a\n  1. [ ] b\nplain");
    expect(toggleTaskLine(src, 2)).toBe(src);
    expect(toggleTaskLine(src, 9)).toBe(src);
  });
});
