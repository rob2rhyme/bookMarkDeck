// Reader view, part one: a page's HTML in, its readable text out — as plain blocks,
// never HTML. The renderer turns blocks into React elements, so nothing a page
// contains (a script, an `onerror`) can reach the DOM, and links and images are
// simply not carried (the reader offers "open the original" for those).
//
// A small parser of our own rather than a library, like the Notes markdown: it
// is a deliberate subset, and what it can't read well it leaves out rather than
// guessing. Pure — see readerExtract.test.ts.

import { decodeEntities, extractTitle, metaContent } from "@/lib/pageTitle";

export type ReaderBlock =
  | { type: "h"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "p"; text: string }
  | { type: "li"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string };

export type Article = {
  title: string | null;
  byline: string | null;
  blocks: ReaderBlock[];
  /** The page was longer than the reader keeps. */
  truncated: boolean;
};

export const MAX_BLOCKS = 1500;
export const MAX_CHARS = 150_000;
const MIN_ARTICLE_CHARS = 400; // below this an <article>/<main> is a teaser, not the page

// Whole elements that are never reading material.
const SKIP = new Set([
  "script", "style", "noscript", "svg", "template", "iframe", "canvas", "head",
  "nav", "footer", "aside", "form", "button", "select", "dialog", "audio", "video", "object",
]);
// Boundaries of a block of text. Inline tags (a, span, em, b…) are not here.
const BLOCK = new Set([
  "p", "div", "section", "article", "main", "header", "ul", "ol", "li", "blockquote", "pre",
  "table", "tr", "td", "th", "figure", "figcaption", "dl", "dt", "dd", "hr", "br",
  "h1", "h2", "h3", "h4", "h5", "h6",
]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr", "area", "base", "col", "embed", "param", "track"]);

type Region = "article" | "main" | "body";
type Kind = "p" | "li" | "quote" | "code" | { h: 1 | 2 | 3 | 4 };
type Raw = { kind: Kind; text: string; region: Region };

const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|([^<]+)|</g;

function collapse(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Every text block on the page, tagged with the region it sat in. */
function collect(html: string): Raw[] {
  const out: Raw[] = [];
  const kinds: Kind[] = [];
  let skip = 0; // depth inside a SKIP element (one at a time; nested ones just deepen it)
  let skipTag = "";
  let article = 0;
  let main = 0;
  let pre = 0;
  let buf = "";

  const region = (): Region => (article > 0 ? "article" : main > 0 ? "main" : "body");
  const flush = () => {
    const kind = kinds[kinds.length - 1] ?? "p";
    const text = kind === "code" ? decodeEntities(buf).replace(/\r/g, "").replace(/^\n+|\s+$/g, "") : collapse(decodeEntities(buf));
    buf = "";
    if (text) out.push({ kind, text, region: region() });
  };

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    const [, closing, rawName, selfClose, text] = m;
    if (rawName === undefined) {
      if (text !== undefined && skip === 0) buf += text;
      continue;
    }
    const name = rawName.toLowerCase();
    const isClose = closing === "/";

    if (skip > 0) {
      if (name === skipTag) skip += isClose ? -1 : selfClose || VOID.has(name) ? 0 : 1;
      continue;
    }
    if (SKIP.has(name) && !isClose && !selfClose) {
      flush();
      skip = 1;
      skipTag = name;
      continue;
    }

    if (name === "article") article += isClose ? -1 : 1;
    if (name === "main") main += isClose ? -1 : 1;
    if (article < 0) article = 0;
    if (main < 0) main = 0;

    if (name === "pre") {
      flush();
      if (isClose) {
        pre = Math.max(0, pre - 1);
        kinds.pop();
      } else {
        pre++;
        kinds.push("code");
      }
      continue;
    }
    if (name === "br" && pre > 0) {
      buf += "\n";
      continue;
    }
    if (BLOCK.has(name)) {
      flush();
      const h = /^h([1-6])$/.exec(name);
      const pushes: Kind | null = h
        ? { h: Math.min(4, Number(h[1])) as 1 | 2 | 3 | 4 }
        : name === "li" || name === "dt" || name === "dd"
          ? "li"
          : name === "blockquote"
            ? "quote"
            : null;
      if (pushes) {
        if (isClose) kinds.pop();
        else kinds.push(pushes);
      }
    }
  }
  flush();
  return out;
}

function toBlocks(raws: Raw[]): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  let last = "";
  for (const r of raws) {
    // Short loose text in the page body is menus, bylines and "Share" buttons.
    if (r.kind === "p" && r.region === "body" && r.text.length < 25) continue;
    const key = typeof r.kind === "object" ? `h${r.kind.h}:${r.text}` : `${r.kind}:${r.text}`;
    if (key === last) continue; // the same line twice in a row is a rendering artefact
    last = key;
    blocks.push(typeof r.kind === "object" ? { type: "h", level: r.kind.h, text: r.text } : ({ type: r.kind, text: r.text } as ReaderBlock));
  }
  return blocks;
}

const size = (raws: Raw[]) => raws.reduce((n, r) => n + r.text.length, 0);

export function extractArticle(html: string): Article {
  const all = collect(html);
  // Prefer the page's own statement of where the article is, when it holds enough
  // to be the article and not a teaser for one.
  const inArticle = all.filter((r) => r.region === "article");
  const inMain = all.filter((r) => r.region === "main" || r.region === "article");
  const chosen =
    size(inArticle) >= MIN_ARTICLE_CHARS ? inArticle : size(inMain) >= MIN_ARTICLE_CHARS ? inMain : all;

  const title = extractTitle(html);
  let blocks = toBlocks(chosen);
  // The page title usually repeats as the first heading; the reader shows it once.
  if (title && blocks[0]?.type === "h" && blocks[0].text.toLowerCase() === title.toLowerCase()) blocks = blocks.slice(1);

  let truncated = false;
  let chars = 0;
  const kept: ReaderBlock[] = [];
  for (const b of blocks) {
    if (kept.length >= MAX_BLOCKS || chars + b.text.length > MAX_CHARS) {
      truncated = true;
      break;
    }
    chars += b.text.length;
    kept.push(b);
  }

  const author = collapse(decodeEntities(metaContent(html, "author") ?? metaContent(html, "article:author") ?? ""));
  return { title, byline: author && !/^https?:/i.test(author) ? author.slice(0, 120) : null, blocks: kept, truncated };
}

/** Whether a page gave us enough to be worth showing. */
export function isReadable(article: Article): boolean {
  return article.blocks.reduce((n, b) => n + b.text.length, 0) >= 200;
}
