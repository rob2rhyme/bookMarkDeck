// A small markdown parser for note previews. Pure — no React, no Firebase.
//
// Why not a library: the renderer builds React elements from this tree, so no
// HTML string ever reaches the DOM — a pasted <script> or onerror= is just
// text. Links are allowed only for http(s), mailto and tel. And it adds no
// dependency (see CLAUDE.md → Dependency security note).
//
// Supported (a deliberate subset of CommonMark + GFM): ATX headings, paragraphs
// with single newlines kept as line breaks (notes are written that way), fenced
// code, blockquotes, nested bullet / numbered lists, task items, horizontal
// rules, pipe tables; inline **bold**, *italic*, ~~strike~~, `code`, [links](…),
// bare URLs and backslash escapes. Raw HTML is not interpreted.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "del"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "br" };

export type ListItem = {
  /** null = not a task; otherwise whether it is ticked. */
  checked: boolean | null;
  /** 0-based source line of the item's marker — what a tap on its checkbox edits. */
  line: number;
  children: Block[];
};

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; lang: string; text: string }
  | { type: "quote"; children: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "hr" }
  | { type: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] };

type Line = { text: string; n: number };

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}> ?/;
const ITEM_RE = /^([ \t]*)([-*+•]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
const TASK_RE = /^\[([ xX])\](?:[ \t]+|$)/;
const BARE_TASK_RE = /^([ \t]*)(\[[ xX]\](?:[ \t]+|$).*)$/;

type ItemMatch = { indent: string; marker: string; pad: string; rest: string };

/**
 * A list-item line: "- x", "1. x", or a BARE task "[ ] x" with no bullet —
 * which the editor's list continuation writes (lib/smartText.ts), so the
 * preview must read it as a task too. A bare task counts as a bullet item.
 */
function matchItem(text: string): ItemMatch | null {
  const m = ITEM_RE.exec(text);
  if (m) return { indent: m[1], marker: m[2], pad: m[3], rest: m[4] };
  const b = BARE_TASK_RE.exec(text);
  return b ? { indent: b[1], marker: "", pad: "", rest: b[2] } : null;
}
const TABLE_SEP_RE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const isBlank = (s: string) => s.trim() === "";
const indentOf = (s: string) => /^[ \t]*/.exec(s)![0].replace(/\t/g, "    ").length;

/** Strip up to `n` columns of leading indentation. */
function dedent(s: string, n: number): string {
  let i = 0;
  let col = 0;
  while (i < s.length && col < n && (s[i] === " " || s[i] === "\t")) {
    col += s[i] === "\t" ? 4 : 1;
    i++;
  }
  return s.slice(i);
}

function startsBlock(text: string): boolean {
  return FENCE_RE.test(text) || HEADING_RE.test(text) || HR_RE.test(text) || QUOTE_RE.test(text) || matchItem(text) !== null;
}

function splitRow(row: string): string[] {
  let r = row.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < r.length; i++) {
    if (r[i] === "\\" && r[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (r[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += r[i];
  }
  cells.push(cur.trim());
  return cells;
}

function parseLines(lines: Line[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const { text } = lines[i];
    if (isBlank(text)) {
      i++;
      continue;
    }

    const fence = FENCE_RE.exec(text);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].text.trimStart().startsWith(marker)) body.push(lines[i++].text);
      i++; // the closing fence (or past the end: an unclosed fence runs to the end)
      out.push({ type: "code", lang: fence[2] ?? "", text: body.join("\n") });
      continue;
    }

    const heading = HEADING_RE.exec(text);
    if (heading) {
      out.push({ type: "heading", level: heading[1].length, children: parseInline(heading[2] ?? "") });
      i++;
      continue;
    }

    if (HR_RE.test(text)) {
      out.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE_RE.test(text)) {
      const inner: Line[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i].text)) {
        inner.push({ text: lines[i].text.replace(QUOTE_RE, ""), n: lines[i].n });
        i++;
      }
      out.push({ type: "quote", children: parseLines(inner) });
      continue;
    }

    if (text.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1].text) && lines[i + 1].text.includes("-")) {
      const head = splitRow(text);
      const align: Align[] = splitRow(lines[i + 1].text).map((c) =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null
      );
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !isBlank(lines[i].text) && lines[i].text.includes("|")) {
        const cells = splitRow(lines[i++].text);
        rows.push(head.map((_, c) => parseInline(cells[c] ?? "")));
      }
      out.push({ type: "table", align: head.map((_, c) => align[c] ?? null), head: head.map((h) => parseInline(h)), rows });
      continue;
    }

    if (matchItem(text)) {
      const r = parseList(lines, i);
      out.push(r.block);
      i = r.next;
      continue;
    }

    // Paragraph: runs until a blank line or the start of another block.
    const para: string[] = [text.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i].text) && !startsBlock(lines[i].text)) para.push(lines[i++].text.trim());
    out.push({ type: "paragraph", children: parseInline(para.join("\n")) });
  }
  return out;
}

/**
 * A list starting at `start`: consecutive items of the same kind at the first
 * item's indent. Lines indented deeper belong to the item above (nested lists,
 * continued text); a blank line is kept inside the list only if indented
 * content follows it.
 */
function parseList(lines: Line[], start: number): { block: Block; next: number } {
  const first = matchItem(lines[start].text)!;
  const base = indentOf(first.indent);
  const ordered = /\d/.test(first.marker);
  const delim = ordered ? first.marker.slice(-1) : null;
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const m = matchItem(lines[i].text);
    if (!m || indentOf(m.indent) !== base) break;
    if (/\d/.test(m.marker) !== ordered || (ordered && m.marker.slice(-1) !== delim)) break;
    const contentIndent = base + m.marker.length + (m.marker ? Math.max(1, m.pad.replace(/\t/g, "    ").length) : 0);
    let content = m.rest;
    let checked: boolean | null = null;
    const task = TASK_RE.exec(content);
    if (task) {
      checked = task[1] !== " ";
      content = content.slice(task[0].length);
    }
    const body: Line[] = [{ text: content, n: lines[i].n }];
    const itemLine = lines[i].n;
    i++;
    while (i < lines.length) {
      const t = lines[i].text;
      if (isBlank(t)) {
        // Keep the blank only if the item continues after it.
        let j = i;
        while (j < lines.length && isBlank(lines[j].text)) j++;
        if (j < lines.length && indentOf(lines[j].text) > base) {
          for (; i < j; i++) body.push({ text: "", n: lines[i].n });
          continue;
        }
        break;
      }
      if (indentOf(t) <= base) break;
      body.push({ text: dedent(t, contentIndent), n: lines[i].n });
      i++;
    }
    items.push({ checked, line: itemLine, children: parseLines(body) });
  }

  return {
    block: { type: "list", ordered, start: ordered ? Number(first.marker.slice(0, -1)) : 1, items },
    next: i,
  };
}

export function parseMarkdown(src: string): Block[] {
  return parseLines(src.replace(/\r\n?/g, "\n").split("\n").map((text, n) => ({ text, n })));
}

/* ---------------------------------------------------------------- inline --- */

/** The only link targets rendered as links; anything else stays text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim().replace(/^<|>$/g, "");
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href;
  if (/^www\./i.test(href)) return `https://${href}`;
  return null;
}

const PUNCT = /[!-/:-@[-`{-~]/;
const URL_RE = /^(?:https?:\/\/|www\.)[^\s<]*[^\s<.,:;"')\]!?*_~]/i;
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Index of the closing `delim` for an opener at `from`, or -1. */
function findClose(s: string, from: number, delim: string): number {
  let j = from;
  while ((j = s.indexOf(delim, j)) !== -1) {
    if (s[j - 1] === "\\") {
      j++;
      continue;
    }
    // Treat a run of the marker as one unit: "*" never closes on half of "**".
    let runEnd = j;
    while (s[runEnd] === delim[0]) runEnd++;
    if (delim.length === 1 && runEnd - j !== 1) {
      j = runEnd;
      continue;
    }
    const before = s[j - 1];
    const after = s[j + delim.length];
    // A closer follows non-space; "_" must not sit inside a word.
    if (before && !/\s/.test(before) && !(delim[0] === "_" && isWord(after))) return j;
    j = runEnd;
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (c === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (c === "\n") {
      flush();
      out.push({ type: "br" });
      i++;
      continue;
    }
    if (c === "`") {
      const run = /^`+/.exec(s.slice(i))![0];
      const end = s.indexOf(run, i + run.length);
      if (end !== -1) {
        flush();
        out.push({ type: "code", text: s.slice(i + run.length, end).replace(/^ (.+) $/, "$1") });
        i = end + run.length;
        continue;
      }
      buf += run;
      i += run.length;
      continue;
    }
    if (c === "[") {
      const close = s.indexOf("](", i + 1);
      const end = close === -1 ? -1 : s.indexOf(")", close + 2);
      if (close !== -1 && end !== -1 && !s.slice(i + 1, close).includes("\n")) {
        const href = safeHref(s.slice(close + 2, end));
        if (href) {
          flush();
          out.push({ type: "link", href, children: parseInline(s.slice(i + 1, close)) });
          i = end + 1;
          continue;
        }
      }
    }
    if ((c === "h" || c === "w" || c === "H" || c === "W") && !isWord(s[i - 1])) {
      const m = URL_RE.exec(s.slice(i));
      if (m) {
        const href = safeHref(m[0]);
        if (href) {
          flush();
          out.push({ type: "link", href, children: [{ type: "text", text: m[0] }] });
          i += m[0].length;
          continue;
        }
      }
    }
    if (c === "*" || c === "_" || c === "~") {
      const double = s[i + 1] === c;
      if (c === "~" && !double) {
        buf += c;
        i++;
        continue;
      }
      const delim = double ? c + c : c;
      const opensOk = s[i + delim.length] && !/\s/.test(s[i + delim.length]) && !(c === "_" && isWord(s[i - 1]));
      const close = opensOk ? findClose(s, i + delim.length + 1, delim) : -1;
      if (close !== -1) {
        flush();
        const type = c === "~" ? "del" : double ? "strong" : "em";
        out.push({ type, children: parseInline(s.slice(i + delim.length, close)) });
        i = close + delim.length;
        continue;
      }
      buf += delim;
      i += delim.length;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/* ------------------------------------------------------------ plain text --- */

/** Inline markdown reduced to its visible text: "**a** [b](u)" → "a b". */
function inlinePlain(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.type === "text" || n.type === "code" ? n.text : n.type === "br" ? "\n" : "children" in n ? inlinePlain(n.children) : ""))
    .join("");
}

/**
 * The note as a reader sees it, line for line — what cards preview and search
 * matches against, so "**milk**" is found by "milk" and shows without asterisks.
 * Line structure is kept (fence lines are the only ones dropped), so "first
 * line" and "the line that matched" still mean what they did.
 */
export function toPlainText(src: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const f = FENCE_RE.exec(raw);
    if (fence) {
      if (raw.trimStart().startsWith(fence)) fence = null;
      else out.push(raw);
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (HR_RE.test(raw) || TABLE_SEP_RE.test(raw) && raw.includes("-") && raw.includes("|")) {
      out.push("");
      continue;
    }
    let line = raw;
    let lead = "";
    const h = HEADING_RE.exec(line);
    if (h) line = h[2] ?? "";
    else {
      line = line.replace(QUOTE_RE, "");
      const m = matchItem(line);
      if (m) {
        let rest = m.rest;
        const task = TASK_RE.exec(rest);
        if (task) {
          lead = task[1] === " " ? "☐ " : "☑ ";
          rest = rest.slice(task[0].length);
        } else lead = /\d/.test(m.marker) ? `${m.marker} ` : "• ";
        line = m.indent + rest;
      }
      if (/^[ \t]*\|/.test(line)) line = splitRow(line).join(" · ");
    }
    const indent = /^[ \t]*/.exec(line)![0];
    out.push(indent + lead + inlinePlain(parseInline(line.slice(indent.length))));
  }
  return out.join("\n");
}

/** Tick or untick the task item on source line `n`. Returns the body unchanged if that line isn't a task. */
export function toggleTaskLine(src: string, n: number): string {
  const lines = src.split("\n");
  const line = lines[n];
  if (line === undefined) return src;
  const m = matchItem(line);
  if (!m) return src;
  const at = m.indent.length + m.marker.length + m.pad.length;
  const task = TASK_RE.exec(line.slice(at));
  if (!task) return src;
  lines[n] = line.slice(0, at + 1) + (task[1] === " " ? "x" : " ") + line.slice(at + 2);
  return lines.join("\n");
}
