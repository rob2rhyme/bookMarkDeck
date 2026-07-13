// Shared search-match highlighting. Pure + framework-free so it can be
// unit-tested and reused by every search surface (bookmarks, folders, to-dos,
// dreams, habits, command palette). The React wrapper lives in
// `@/components/HighlightedText`.

export type HighlightSegment = { text: string; match: boolean };

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** Split `text` into consecutive segments, flagging the ones that match the
 *  (case-insensitive, literal) `query`. An empty/whitespace query yields a
 *  single non-matching segment (search inactive). The query is treated as a
 *  literal string — regex metacharacters are escaped, so "c++" or "a.b" match
 *  verbatim rather than as patterns. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  const q = query.trim();
  if (!q) return [{ text, match: false }];

  const re = new RegExp(q.replace(REGEX_META, "\\$&"), "ig");
  const segments: HighlightSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), match: false });
    segments.push({ text: m[0], match: true });
    last = m.index + m[0].length;
    // Escaped, non-empty query always advances, but guard against a zero-length
    // match ever stalling the loop.
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments;
}

/** True when `text` contains a case-insensitive match for `query` (empty query
 *  counts as no highlight). Cheap guard so callers can skip wrapper work. */
export function hasHighlight(text: string, query: string): boolean {
  const q = query.trim();
  if (!q || !text) return false;
  return text.toLowerCase().includes(q.toLowerCase());
}
