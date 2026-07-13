import { Fragment, type ReactNode } from "react";

import { highlightSegments } from "@/lib/highlight";

// Shared search-match highlighter. Wraps the slices of `text` that match the
// active `query` in a <mark>, tinted with the app's blue accent and underlined,
// so results are legible in both the dark app shell and the light bookmark
// cards. Purely presentational + XSS-safe (nodes are built directly, never
// dangerouslySetInnerHTML). With no query (or no match) it renders `text`
// unchanged, so it is a drop-in for any plain label.

const MARK_CLASS =
  "rounded-[2px] bg-blue-400/30 text-inherit underline decoration-blue-400/70 underline-offset-2";

/** Build inline nodes for `text` with matches wrapped in <mark>. No wrapper
 *  element — suitable for splicing into an existing inline context (e.g.
 *  NoteText's linkified output). Returns `[text]` when there is nothing to
 *  highlight. */
export function highlightToNodes(text: string, query?: string): ReactNode[] {
  const segments = highlightSegments(text, query ?? "");
  if (segments.length <= 1) return [text];
  return segments.map((seg, i) =>
    seg.match ? (
      <mark key={i} className={MARK_CLASS}>
        {seg.text}
      </mark>
    ) : (
      <Fragment key={i}>{seg.text}</Fragment>
    )
  );
}

export function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query?: string;
  className?: string;
}) {
  const nodes = highlightToNodes(text, query);
  return <span className={className}>{nodes}</span>;
}

export default HighlightedText;
