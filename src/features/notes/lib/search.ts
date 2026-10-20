// Note search. Pure — no React, no Firebase.
//
// - Every word must match somewhere (title, body or a tag); order doesn't matter.
// - "quoted phrases" match as one term; "#tag" tokens filter by tag.
// - Case- AND accent-insensitive: "cafe" finds "Café". Matching runs on a folded
//   copy, and each folded character remembers where it came from, so highlight
//   ranges land on the ORIGINAL text even where folding changed its length.
// - Ranked: a title hit outweighs a tag hit outweighs a body hit. Ties keep the
//   order the notes came in (pinned first, then most recent).

import { cardText, type Note } from "@/features/notes/lib/notes";
import { normalizeTag } from "@/features/notes/lib/tags";

export type Range = [start: number, end: number];
export type ParsedQuery = { terms: string[]; tags: string[] };
export type Highlighted = { text: string; ranges: Range[] };
export type NoteHit = { note: Note; title: Highlighted; preview: Highlighted };

/** Lowercase and strip combining marks. */
const foldChar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The folded string, plus for each folded code unit the original index it came from. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(i);
    i += ch.length;
  }
  return { folded, map };
}

export function parseQuery(raw: string): ParsedQuery {
  const terms: string[] = [];
  const tags: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      const t = foldChar(m[1].trim());
      if (t) terms.push(t);
    } else if (m[2].startsWith("#") && m[2].length > 1) {
      const t = normalizeTag(m[2]);
      if (t) tags.push(t);
    } else {
      terms.push(foldChar(m[2]));
    }
  }
  return { terms: [...new Set(terms)], tags: [...new Set(tags)] };
}

export const isActive = (q: ParsedQuery) => q.terms.length > 0 || q.tags.length > 0;

/** Every occurrence of every term in `text`, merged and in order. */
export function findRanges(text: string, terms: string[]): Range[] {
  if (!text || terms.length === 0) return [];
  const { folded, map } = foldWithMap(text);
  const raw: Range[] = [];
  for (const term of terms) {
    let from = 0;
    let at: number;
    while (term && (at = folded.indexOf(term, from)) !== -1) {
      const end = at + term.length;
      raw.push([map[at], end < map.length ? map[end] : text.length]);
      from = at + 1;
    }
  }
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Range[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Index just past the first non-empty line of `body` (0 when there is none). */
function afterFirstLine(body: string): number {
  const m = /^\s*\S[^\n]*\n?/.exec(body);
  return m ? m[0].length : 0;
}

const SNIPPET_LEAD = 32;
const SNIPPET_MAX = 160;

/**
 * The body line holding the first match, trimmed to a window around it — a card
 * should show WHY a note matched, not its first line. Ranges are re-based to the
 * snippet. Null when nothing in the body matches.
 */
function snippetFor(body: string, terms: string[]): Highlighted | null {
  const ranges = findRanges(body, terms);
  if (ranges.length === 0) return null;
  const first = ranges[0][0];
  const ls = body.lastIndexOf("\n", first - 1) + 1;
  const leRaw = body.indexOf("\n", first);
  const le = leRaw === -1 ? body.length : leRaw;
  let start = ls;
  let prefix = "";
  if (first - ls > SNIPPET_LEAD) {
    const ws = body.lastIndexOf(" ", first - SNIPPET_LEAD);
    start = ws > ls ? ws + 1 : first - SNIPPET_LEAD;
    prefix = "…";
  }
  let end = le;
  let suffix = "";
  if (end - start > SNIPPET_MAX) {
    end = start + SNIPPET_MAX;
    suffix = "…";
  }
  const raw = body.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const text = prefix + raw.trim() + suffix;
  const shift = prefix.length - start - lead;
  const inner = ranges
    .filter(([s, e]) => e > start + lead && s < end)
    .map(([s, e]): Range => [Math.max(s + shift, prefix.length), Math.min(e + shift, text.length - suffix.length)])
    .filter(([s, e]) => e > s);
  return { text, ranges: inner };
}

/**
 * Filter and rank `notes` (already in display order) for `query`, optionally
 * restricted to `tag`. An inactive query with no tag returns every note.
 */
export function searchNotes(notes: Note[], query: string, tag: string | null = null): NoteHit[] {
  const q = parseQuery(query);
  const wantTags = tag ? [...new Set([...q.tags, tag])] : q.tags;
  const scored: { hit: NoteHit; score: number; i: number }[] = [];

  notes.forEach((note, i) => {
    if (!wantTags.every((t) => note.tags.includes(t))) return;
    const card = cardText(note);
    const fTitle = foldChar(note.title);
    const fBody = foldChar(note.body);
    let score = 0;
    for (const term of q.terms) {
      const inTitle = fTitle.includes(term);
      const inTag = note.tags.some((t) => foldChar(t).includes(term));
      const inBody = fBody.includes(term);
      if (!inTitle && !inTag && !inBody) return;
      score += inTitle ? 3 : inTag ? 2 : 1;
    }
    // An untitled note's card title IS its first line, so the snippet looks below it.
    const cut = note.title.trim() ? 0 : afterFirstLine(note.body);
    const snip = q.terms.length ? snippetFor(note.body.slice(cut), q.terms) : null;
    const preview = snip || {
      text: card.preview,
      ranges: findRanges(card.preview, q.terms),
    };
    scored.push({
      hit: { note, title: { text: card.title, ranges: findRanges(card.title, q.terms) }, preview },
      score,
      i,
    });
  });

  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.hit);
}
