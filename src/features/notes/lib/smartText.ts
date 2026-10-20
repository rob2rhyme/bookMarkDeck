// Plain-text editing smarts for the note editor: lists that continue on Enter,
// Tab / Shift-Tab indenting, and checkbox toggling. Nothing is rendered — the
// note stays plain text; these only insert or remove characters.
//
// Each function returns a TextEdit (replace [from, to) with `insert`, then
// select [selStart, selEnd) in the NEW text) or null to let the browser do its
// default. Returning a minimal edit rather than a whole new value is what lets
// the editor apply it through execCommand("insertText"), which keeps native undo
// working — setting `value` directly wipes the undo stack.

export type TextEdit = {
  from: number;
  to: number;
  insert: string;
  selStart: number;
  selEnd: number;
};

export type ListMarker = {
  indent: string;
  /** "-", "*", "+", "•", or null for a numbered or bare-checkbox line. */
  bullet: string | null;
  num: number | null;
  delim: "." | ")" | null;
  /** null = no checkbox; otherwise whether it is ticked. */
  checked: boolean | null;
  /** Length of the whole prefix, indent included. */
  length: number;
};

const INDENT = "  ";

const MARKER_RE =
  /^([ \t]*)(?:([-*+•])|(\d{1,9})([.)]))[ \t]+(?:\[([ xX])\](?:[ \t]+|$))?/;
const BARE_BOX_RE = /^([ \t]*)\[([ xX])\](?:[ \t]+|$)/;

export function parseMarker(line: string): ListMarker | null {
  const m = MARKER_RE.exec(line);
  if (m) {
    return {
      indent: m[1],
      bullet: m[2] ?? null,
      num: m[3] ? Number(m[3]) : null,
      delim: (m[4] as "." | ")" | undefined) ?? null,
      checked: m[5] === undefined ? null : m[5] !== " ",
      length: m[0].length,
    };
  }
  const b = BARE_BOX_RE.exec(line);
  if (b) {
    return {
      indent: b[1],
      bullet: null,
      num: null,
      delim: null,
      checked: b[2] !== " ",
      length: b[0].length,
    };
  }
  return null;
}

/** The prefix a new item after `mk` starts with. A new checkbox is always unticked. */
function nextPrefix(mk: ListMarker): string {
  const box = mk.checked === null ? "" : "[ ] ";
  if (mk.bullet) return `${mk.indent}${mk.bullet} ${box}`;
  if (mk.num !== null) return `${mk.indent}${mk.num + 1}${mk.delim} ${box}`;
  return `${mk.indent}${box}`;
}

const lineStartOf = (v: string, i: number) => v.lastIndexOf("\n", i - 1) + 1;
const lineEndOf = (v: string, i: number) => {
  const e = v.indexOf("\n", i);
  return e === -1 ? v.length : e;
};

/**
 * Renumber the numbered siblings that follow `fromLineEnd`, starting at `next`.
 * Deeper-indented lines (sub-items, wrapped text) are kept and skipped; the run
 * ends at the first line that is shallower, or at the same depth but not a
 * numbered item. Returns the rewritten tail and where it ends in `value`.
 */
function renumberTail(
  value: string,
  fromLineEnd: number,
  indent: string,
  delim: string,
  next: number
): { text: string; end: number } {
  let pos = fromLineEnd;
  let n = next;
  let out = "";
  while (pos < value.length && value[pos] === "\n") {
    const s = pos + 1;
    const e = lineEndOf(value, s);
    const line = value.slice(s, e);
    const lead = /^[ \t]*/.exec(line)![0];
    if (line.trim() === "" || lead.length < indent.length) break;
    if (lead.length > indent.length) {
      out += "\n" + line;
      pos = e;
      continue;
    }
    const mk = parseMarker(line);
    if (!mk || mk.num === null || mk.delim !== delim) break;
    out += "\n" + `${indent}${n}${delim}` + line.slice(lead.length + String(mk.num).length + 1);
    n++;
    pos = e;
  }
  return { text: out, end: pos };
}

/**
 * Enter inside a list item: start the next item, carrying the indent, bullet
 * or number (+1, renumbering the items below) and an unticked checkbox. Enter on
 * an EMPTY item ends the list — outdenting one level first if it is nested,
 * which is how every major editor behaves.
 */
export function continueList(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const ls = lineStartOf(value, start);
  const le = lineEndOf(value, start);
  const line = value.slice(ls, le);
  const mk = parseMarker(line);
  if (!mk || start - ls < mk.length) return null;

  if (line.slice(mk.length).trim() === "") {
    if (mk.indent.length > 0) {
      const cut = mk.indent.startsWith("\t") ? 1 : Math.min(INDENT.length, mk.indent.length);
      return { from: ls, to: ls + cut, insert: "", selStart: start - cut, selEnd: start - cut };
    }
    return { from: ls, to: le, insert: "", selStart: ls, selEnd: ls };
  }

  const prefix = nextPrefix(mk);
  const caret = start + 1 + prefix.length;
  if (mk.num !== null && mk.delim) {
    const tail = renumberTail(value, le, mk.indent, mk.delim, mk.num + 2);
    return {
      from: start,
      to: tail.end,
      insert: "\n" + prefix + value.slice(start, le) + tail.text,
      selStart: caret,
      selEnd: caret,
    };
  }
  return { from: start, to: start, insert: "\n" + prefix, selStart: caret, selEnd: caret };
}

/** The [start, end) of the whole lines a selection touches. A selection ending at column 0 doesn't touch that line. */
function touchedBlock(value: string, start: number, end: number) {
  const s = lineStartOf(value, start);
  const effEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  return { s, e: lineEndOf(value, Math.max(effEnd, s)) };
}

/** Rewrite each touched line, mapping the selection through the length changes. */
function mapLines(
  value: string,
  start: number,
  end: number,
  fn: (line: string) => { line: string; at: number }
): TextEdit | null {
  const { s, e } = touchedBlock(value, start, end);
  const lines = value.slice(s, e).split("\n");
  // Each line changes at one point `at`: an insertion (delta > 0), a deletion
  // (delta < 0) or a same-length swap. Positions map through all of them.
  const changes: { c: number; delta: number }[] = [];
  let pos = s;
  const out: string[] = [];
  for (const line of lines) {
    const { line: next, at } = fn(line);
    const delta = next.length - line.length;
    if (delta !== 0) changes.push({ c: pos + at, delta });
    out.push(next);
    pos += line.length + 1;
  }
  const insert = out.join("\n");
  if (insert === value.slice(s, e)) return null;
  const map = (p: number) => {
    let shift = 0;
    for (const { c, delta } of changes) {
      if (delta > 0 ? p >= c : p >= c - delta) shift += delta;
      else if (delta < 0 && p > c) shift -= p - c; // inside the deleted span
    }
    return p + shift;
  };
  return { from: s, to: e, insert, selStart: map(start), selEnd: map(end) };
}

/** Tab captures focus only where it has editing meaning: a list line, or a multi-line selection. Elsewhere it still moves focus. */
export function tabIndents(value: string, start: number, end: number): boolean {
  if (value.slice(start, end).includes("\n")) return true;
  const ls = lineStartOf(value, start);
  return parseMarker(value.slice(ls, lineEndOf(value, start))) !== null;
}

export function indentLines(value: string, start: number, end: number, outdent: boolean): TextEdit | null {
  return mapLines(value, start, end, (line) => {
    if (!outdent) return { line: line === "" ? line : INDENT + line, at: 0 };
    if (line.startsWith("\t")) return { line: line.slice(1), at: 0 };
    const n = /^ {0,2}/.exec(line)![0].length;
    return { line: line.slice(n), at: 0 };
  });
}

/**
 * ⌘/Ctrl+Enter: tick or untick a checkbox; on a plain list item, add one; on a
 * plain line, turn it into a "- [ ] " item. Applies to every touched line.
 */
export function toggleChecklist(value: string, start: number, end: number): TextEdit | null {
  return mapLines(value, start, end, (line) => {
    const mk = parseMarker(line);
    if (mk && mk.checked !== null) {
      const i = line.indexOf("[", mk.indent.length) + 1;
      return { line: line.slice(0, i) + (mk.checked ? " " : "x") + line.slice(i + 1), at: i };
    }
    if (mk) {
      const at = mk.length;
      return { line: line.slice(0, at) + "[ ] " + line.slice(at), at };
    }
    const indent = /^[ \t]*/.exec(line)![0];
    return { line: `${indent}- [ ] ${line.slice(indent.length)}`, at: indent.length };
  });
}
