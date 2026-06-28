"use client";

import { Fragment, type ReactNode } from "react";

import { hasBullets, toNoteBlocks } from "@/utils/noteFormat";

// Shared, XSS-safe note renderer used everywhere a user-written note is shown
// (journal, dreams, to-dos, habit notes, bookmark notes). It:
//   • turns markdown-ish bullet lines ("- ", "* ", "• ") into a real list, and
//   • linkifies [label](https://…) and bare https URLs.
// No HTML is injected — nodes are built directly. When a note has no bullet
// lines it renders as a single inline <span>, identical to the old plain text,
// so existing layouts are unchanged unless the user actually uses bullets.

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Build inline nodes for one line, linkifying URLs. */
function linkify(text: string): ReactNode[] {
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    let url: string;
    let label: string;
    let tail = "";
    if (m[1] && m[2]) {
      label = m[1];
      url = m[2];
    } else {
      url = m[3];
      const trailing = url.match(/[).,!?;:]+$/);
      if (trailing) {
        tail = trailing[0];
        url = url.slice(0, -tail.length);
      }
      label = hostLabel(url);
    }
    nodes.push(
      <a
        key={`l${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-sky-400 underline-offset-2 hover:underline"
      >
        {label}
      </a>
    );
    if (tail) nodes.push(tail);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}

export function NoteText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Fast path: no bullets → inline span, byte-for-byte like the old display.
  if (!hasBullets(text)) {
    return (
      <span className={className}>
        <Inline text={text} />
      </span>
    );
  }

  const blocks = toNoteBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.type === "list" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline text={it} />
              </li>
            ))}
          </ul>
        ) : (
          <span key={i} className="block whitespace-pre-wrap">
            <Inline text={b.text} />
          </span>
        )
      )}
    </div>
  );
}

export default NoteText;
