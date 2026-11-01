import { Fragment } from "react";

import type { Highlighted } from "@/features/notes/lib/search";

// Renders search ranges as <mark>. The shared @/components/HighlightedText
// highlights ONE literal phrase; note search matches several words, accent-
// folded, so its ranges come from lib/search.ts. Same mark styling as the
// shared component, so every search surface looks alike.
const MARK_CLASS =
  "rounded-[2px] bg-blue-400/30 text-inherit underline decoration-blue-400/70 underline-offset-2";

export function Highlight({ text, ranges }: Highlighted) {
  if (ranges.length === 0) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([s, e], i) => {
    if (s > last) out.push(<Fragment key={`t${i}`}>{text.slice(last, s)}</Fragment>);
    out.push(
      <mark key={`m${i}`} className={MARK_CLASS}>
        {text.slice(s, e)}
      </mark>
    );
    last = e;
  });
  if (last < text.length) out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
