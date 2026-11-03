// Where a block of reader text has highlights: the block split into plain and
// marked runs. A highlight is found by its text (the page itself isn't stored), so
// one that no longer appears — the page changed — just isn't marked. Pure — see
// highlightSegments.test.ts.

import type { BookmarkHighlight } from "@/types/bookmark";

export type Segment = { text: string; highlightId?: string };

export function segmentBlock(text: string, highlights: BookmarkHighlight[]): Segment[] {
  const found: { start: number; end: number; id: string }[] = [];
  for (const h of highlights) {
    const start = text.indexOf(h.text);
    if (start >= 0) found.push({ start, end: start + h.text.length, id: h.id });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Segment[] = [];
  let at = 0;
  for (const f of found) {
    if (f.start < at) continue; // overlaps an earlier highlight: the earlier one wins
    if (f.start > at) out.push({ text: text.slice(at, f.start) });
    out.push({ text: text.slice(f.start, f.end), highlightId: f.id });
    at = f.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out.length ? out : [{ text }];
}

/** The first block whose text contains the (cleaned) selection, or -1. */
export function blockIndexFor(blocks: { text: string }[], selection: string): number {
  return selection ? blocks.findIndex((b) => b.text.includes(selection)) : -1;
}
