import { describe, expect, it } from "vitest";

import { MAX_BLOCKS, MAX_CHARS, extractArticle, isReadable } from "@/lib/readerExtract";

const LONG = "A calm paragraph about reading without the noise around it. ".repeat(8); // > 400 chars

const page = (body: string, head = "") => `<!doctype html><html><head><title>Fallback title</title>${head}</head><body>${body}</body></html>`;

describe("extractArticle", () => {
  it("takes the <article>, and leaves the navigation, footer and sidebar behind", () => {
    const a = extractArticle(
      page(`
        <nav><a href="/">Home</a><a href="/about">About us today</a></nav>
        <aside>Subscribe to our wonderful newsletter right now</aside>
        <article><h1>Fallback title</h1><h2>First part</h2><p>${LONG}</p><p>Second paragraph.</p></article>
        <footer>Copyright somebody, all rights reserved forever</footer>`)
    );
    expect(a.blocks.map((b) => b.type)).toEqual(["h", "p", "p"]);
    expect(a.blocks[0]).toEqual({ type: "h", level: 2, text: "First part" });
    expect(JSON.stringify(a.blocks)).not.toMatch(/Subscribe|Copyright|Home/);
  });

  it("drops the first heading when it just repeats the page title", () => {
    const a = extractArticle(page(`<article><h1>Fallback title</h1><p>${LONG}</p></article>`));
    expect(a.blocks[0].type).toBe("p");
  });

  it("falls back to <main>, then the whole body, when there is no article", () => {
    const inMain = extractArticle(page(`<div>${"x ".repeat(30)}</div><main><p>${LONG}</p></main>`));
    expect(inMain.blocks).toHaveLength(1);
    const bodyOnly = extractArticle(page(`<div><p>${LONG}</p></div>`));
    expect(bodyOnly.blocks).toHaveLength(1);
  });

  it("ignores an <article> that is only a teaser", () => {
    const a = extractArticle(page(`<article><p>Read more</p></article><div><p>${LONG}</p></div>`));
    expect(a.blocks.some((b) => b.text.startsWith("A calm paragraph"))).toBe(true);
  });

  it("never lets script, styles or event handlers through — blocks are text", () => {
    const a = extractArticle(
      page(`<article><script>alert('x')</script><style>p{color:red}</style>
        <p onclick="steal()">Hello <b>bold</b> and <a href="javascript:evil()">a link</a>. ${LONG}</p>
        <p><img src=x onerror="alert(1)">Caption text that is long enough to keep around here.</p></article>`)
    );
    const all = a.blocks.map((b) => b.text).join("\n");
    expect(all).toContain("Hello bold and a link.");
    expect(all).not.toMatch(/alert|steal|color:red|javascript|onerror|<|>/);
  });

  it("decodes entities and collapses whitespace", () => {
    const a = extractArticle(page(`<article><p>Tom &amp;   Jerry\n   &mdash; &#8220;hi&#8221; ${LONG}</p></article>`));
    expect(a.blocks[0].text.startsWith("Tom & Jerry — “hi” A calm")).toBe(true);
  });

  it("keeps lists, quotes and code as their own blocks, code with its line breaks", () => {
    const a = extractArticle(
      page(`<article><p>${LONG}</p><ul><li>One</li><li>Two <em>items</em></li></ul>
        <blockquote>A quoted line.</blockquote><pre><code>line 1
  line 2</code></pre></article>`)
    );
    expect(a.blocks.map((b) => b.type)).toEqual(["p", "li", "li", "quote", "code"]);
    expect(a.blocks[2].text).toBe("Two items");
    expect(a.blocks[4].text).toBe("line 1\n  line 2");
  });

  it("clamps deep headings to level 4", () => {
    const a = extractArticle(page(`<article><h6>Tiny</h6><p>${LONG}</p></article>`));
    expect(a.blocks[0]).toEqual({ type: "h", level: 4, text: "Tiny" });
  });

  it("reads the author from meta, but not a URL", () => {
    expect(extractArticle(page(`<article><p>${LONG}</p></article>`, `<meta name="author" content="Ada Lovelace">`)).byline).toBe("Ada Lovelace");
    expect(extractArticle(page(`<article><p>${LONG}</p></article>`, `<meta property="article:author" content="https://example.com/ada">`)).byline).toBeNull();
  });

  it("caps how much it keeps, and says so", () => {
    const many = Array.from({ length: MAX_BLOCKS + 10 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join("");
    const a = extractArticle(page(`<article>${many}</article>`));
    expect(a.blocks).toHaveLength(MAX_BLOCKS);
    expect(a.truncated).toBe(true);
    const huge = extractArticle(page(`<article><p>${"w".repeat(MAX_CHARS - 10)}</p><p>${"z".repeat(100)}</p></article>`));
    expect(huge.blocks).toHaveLength(1);
    expect(huge.truncated).toBe(true);
  });

  it("survives malformed and empty input", () => {
    expect(extractArticle("").blocks).toEqual([]);
    expect(extractArticle("<p>unclosed <b>tags < and stray ><").blocks.length).toBeGreaterThanOrEqual(0);
    expect(extractArticle("<<<>>><!-- <p>comment</p> --><p").blocks).toEqual([]);
  });
});

describe("isReadable", () => {
  it("wants a couple of hundred characters", () => {
    expect(isReadable(extractArticle(page(`<article><p>${LONG}</p></article>`)))).toBe(true);
    expect(isReadable(extractArticle(page(`<article><p>Too short.</p></article>`)))).toBe(false);
  });
});
