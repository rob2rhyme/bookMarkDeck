"use client";

import { Fragment } from "react";

import type { Align, Block, Inline, ListItem } from "@/features/notes/lib/markdown";

// Renders lib/markdown.ts's tree as React elements — never an HTML string, so
// nothing in a note can run as script. Task checkboxes call onToggleTask with
// the item's SOURCE line, which the editor flips in the text.

const H = ["text-2xl", "text-xl", "text-lg", "text-base", "text-base", "text-base"];
const ALIGN = (a: Align) => (a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left");

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <Fragment key={i}>{n.text}</Fragment>;
          case "br":
            return <br key={i} />;
          case "code":
            return (
              <code key={i} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.9em] text-slate-100">
                {n.text}
              </code>
            );
          case "strong":
            return (
              <strong key={i} className="font-semibold text-slate-50">
                <Inlines nodes={n.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines nodes={n.children} />
              </em>
            );
          case "del":
            return (
              <del key={i} className="text-slate-500">
                <Inlines nodes={n.children} />
              </del>
            );
          case "link":
            return (
              <a
                key={i}
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 underline decoration-blue-400/50 underline-offset-2 hover:decoration-blue-300"
              >
                <Inlines nodes={n.children} />
              </a>
            );
        }
      })}
    </>
  );
}

function Item({ item, onToggleTask }: { item: ListItem; onToggleTask?: (line: number) => void }) {
  if (item.checked === null) {
    return (
      <li className="pl-1">
        <Blocks blocks={item.children} onToggleTask={onToggleTask} />
      </li>
    );
  }
  return (
    <li className="flex list-none items-start gap-2">
      <input
        type="checkbox"
        checked={item.checked}
        onChange={() => onToggleTask?.(item.line)}
        disabled={!onToggleTask}
        aria-label={item.checked ? "Mark as not done" : "Mark as done"}
        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-500"
      />
      <div className={`min-w-0 flex-1 ${item.checked ? "text-slate-500 line-through decoration-slate-600" : ""}`}>
        <Blocks blocks={item.children} onToggleTask={onToggleTask} />
      </div>
    </li>
  );
}

function Blocks({ blocks, onToggleTask }: { blocks: Block[]; onToggleTask?: (line: number) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const Tag = `h${b.level}` as "h1";
            return (
              <Tag key={i} className={`${H[b.level - 1]} mt-2 font-semibold tracking-tight text-slate-50 first:mt-0`}>
                <Inlines nodes={b.children} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i}>
                <Inlines nodes={b.children} />
              </p>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                <code className="font-mono text-slate-200">{b.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={i} className="flex flex-col gap-2 border-l-2 border-slate-600 pl-3 text-slate-400">
                <Blocks blocks={b.children} onToggleTask={onToggleTask} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="border-slate-800" />;
          case "list": {
            const tasks = b.items.every((it) => it.checked !== null);
            const cls = `flex flex-col gap-1 ${tasks ? "pl-0" : b.ordered ? "list-decimal pl-6" : "list-disc pl-6"} marker:text-slate-500`;
            return b.ordered ? (
              <ol key={i} start={b.start} className={cls}>
                {b.items.map((it) => (
                  <Item key={it.line} item={it} onToggleTask={onToggleTask} />
                ))}
              </ol>
            ) : (
              <ul key={i} className={cls}>
                {b.items.map((it) => (
                  <Item key={it.line} item={it} onToggleTask={onToggleTask} />
                ))}
              </ul>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {b.head.map((cell, c) => (
                        <th
                          key={c}
                          className={`border-b border-slate-700 px-3 py-1.5 font-semibold text-slate-100 ${ALIGN(b.align[c])}`}
                        >
                          <Inlines nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b border-slate-800/70">
                        {row.map((cell, c) => (
                          <td key={c} className={`px-3 py-1.5 ${ALIGN(b.align[c])}`}>
                            <Inlines nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

export function Markdown({ blocks, onToggleTask }: { blocks: Block[]; onToggleTask?: (line: number) => void }) {
  return (
    <div className="flex flex-col gap-3 break-words text-base leading-relaxed text-slate-200">
      <Blocks blocks={blocks} onToggleTask={onToggleTask} />
    </div>
  );
}
