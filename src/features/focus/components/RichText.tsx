"use client";

import { Fragment, type ReactNode } from "react";

// Renders plain text but turns links into compact, clickable words:
//   • [label](https://…)  → the label, linked
//   • https://long/url     → the bare domain (e.g. "github.com"), linked
// Only http/https is linkified; everything else stays literal text. No HTML is
// injected (nodes are built directly), so it's XSS-safe.

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
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
      const trailing = url.match(/[).,!?;:]+$/); // don't swallow sentence punctuation
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

  return (
    <span className={className}>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </span>
  );
}

export default RichText;
