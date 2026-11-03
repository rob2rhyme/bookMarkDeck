"use client";

import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { useToast } from "@/components/toast/ToastProvider";
import { blockIndexFor, segmentBlock } from "@/lib/highlightSegments";
import type { Article, ReaderBlock } from "@/lib/readerExtract";
import type { Bookmark, BookmarkHighlight } from "@/types/bookmark";
import { addHighlight, cleanHighlightText, removeHighlight, MAX_HIGHLIGHTS } from "@/utils/highlights";
import { isUnsafeUrl, normalizeUrl } from "@/utils/normalizeUrl";
import { fetchArticle } from "@/utils/readerClient";

type Loaded = { url: string; result: "ready" | "none" | "error"; article: Article | null };

/**
 * Reader view: the saved page's text, without the page around it, and the
 * passages you've marked in it. The text is fetched fresh each time and never
 * stored; only the highlights are kept, on the bookmark. Selecting text inside one
 * paragraph and pressing Highlight marks it.
 */
export function ReaderModal({
  bookmark,
  open,
  onClose,
  onHighlightsChange,
}: {
  bookmark: Bookmark;
  open: boolean;
  onClose: () => void;
  onHighlightsChange: (next: BookmarkHighlight[] | undefined) => void;
}) {
  const { toast } = useToast();
  const target = normalizeUrl(bookmark.url);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState("");
  const articleRef = useRef<HTMLDivElement | null>(null);
  const highlights = bookmark.highlights ?? [];

  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    void fetchArticle(target).then((r) => {
      if (!alive) return;
      if (r === "error") setLoaded({ url: target, result: "error", article: null });
      else if (r.article) setLoaded({ url: target, result: "ready", article: r.article });
      else setLoaded({ url: target, result: "none", article: null });
    });
    return () => {
      alive = false;
    };
  }, [open, target]);

  // What's selected inside the article, kept so the button works after the tap
  // that pressed it has moved the selection.
  useEffect(() => {
    if (!open) return;
    const onChange = () => {
      const sel = window.getSelection();
      const root = articleRef.current;
      if (!sel || sel.isCollapsed || !root || !sel.anchorNode || !root.contains(sel.anchorNode) || !sel.focusNode || !root.contains(sel.focusNode)) {
        setSelected("");
        return;
      }
      setSelected(cleanHighlightText(sel.toString()));
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [open]);

  const article = loaded && loaded.url === target ? loaded.article : null;
  const status = !target ? "none" : loaded && loaded.url === target ? loaded.result : "loading";

  const mark = () => {
    if (!article || !selected) return;
    if (blockIndexFor(article.blocks, selected) < 0) {
      toast("Select within a single paragraph to highlight it.", { variant: "error" });
      return;
    }
    const res = addHighlight(highlights, selected);
    if (!res.ok) {
      toast(
        res.reason === "duplicate"
          ? "Already highlighted."
          : res.reason === "full"
            ? `A page holds up to ${MAX_HIGHLIGHTS} highlights.`
            : "Select a few more words.",
        { variant: res.reason === "duplicate" ? undefined : "error" }
      );
      return;
    }
    onHighlightsChange(res.highlights);
    window.getSelection()?.removeAllRanges();
    setSelected("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="reader-title"
      panelClassName="flex w-full max-w-2xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl outline-none"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0">
          <h2 id="reader-title" className="text-base font-semibold tracking-tight text-slate-50">
            {article?.title || bookmark.title}
          </h2>
          {article?.byline && <p className="mt-0.5 text-xs text-slate-400">{article.byline}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {target && !isUnsafeUrl(target) && (
            <a
              href={target}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-500"
            >
              Open original
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-500"
          >
            Close
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {status === "loading" && <p className="text-sm text-slate-400">Loading the page…</p>}
        {status === "error" && (
          <p className="text-sm text-slate-300">Couldn’t reach the page just now. Try again in a moment.</p>
        )}
        {status === "none" && (
          <p className="text-sm text-slate-300">
            This page can’t be shown in reader view — it may need you to sign in, or build its text with scripts.
            Use <span className="text-slate-100">Open original</span> to read it there.
          </p>
        )}
        {article && (
          <div ref={articleRef} className="flex flex-col gap-3 text-[15px] leading-relaxed text-slate-200">
            <Blocks blocks={article.blocks} highlights={highlights} />
            {article.truncated && (
              <p className="text-xs text-slate-500">The page is longer than the reader keeps — open the original for the rest.</p>
            )}
          </div>
        )}

        {highlights.length > 0 && (
          <section aria-label="Highlights" className="mt-6 border-t border-slate-800 pt-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Highlights ({highlights.length})
            </h3>
            <ul className="flex flex-col gap-2">
              {highlights.map((h) => (
                <li key={h.id} className="flex items-start gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-sm text-slate-200">
                  <span className="min-w-0 flex-1">{h.text}</span>
                  <button
                    type="button"
                    aria-label={`Remove highlight: ${h.text.slice(0, 40)}`}
                    onClick={() => onHighlightsChange(removeHighlight(highlights, h.id))}
                    className="shrink-0 rounded px-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {article && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
          <p className="text-xs text-slate-500">
            {selected ? `“${selected.length > 60 ? `${selected.slice(0, 60)}…` : selected}”` : "Select text to highlight it."}
          </p>
          <button
            type="button"
            disabled={!selected}
            // Keep the selection while the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={mark}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Highlight
          </button>
        </div>
      )}
    </Modal>
  );
}

function Text({ text, highlights }: { text: string; highlights: BookmarkHighlight[] }) {
  return (
    <>
      {segmentBlock(text, highlights).map((s, i) =>
        s.highlightId ? (
          <mark key={i} data-highlight={s.highlightId} className="rounded bg-amber-500/25 px-0.5 text-slate-50">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

function Blocks({ blocks, highlights }: { blocks: ReaderBlock[]; highlights: BookmarkHighlight[] }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "li") {
      const items: ReaderBlock[] = [];
      while (i < blocks.length && blocks[i].type === "li") items.push(blocks[i++]);
      i--;
      out.push(
        <ul key={i} className="list-disc space-y-1 pl-6">
          {items.map((it, j) => (
            <li key={j}>
              <Text text={it.text} highlights={highlights} />
            </li>
          ))}
        </ul>
      );
    } else if (b.type === "h") {
      const cls = b.level <= 2 ? "mt-3 text-lg font-semibold text-slate-50" : "mt-2 text-base font-semibold text-slate-100";
      out.push(
        <h3 key={i} className={cls}>
          <Text text={b.text} highlights={highlights} />
        </h3>
      );
    } else if (b.type === "quote") {
      out.push(
        <blockquote key={i} className="border-l-2 border-slate-600 pl-4 text-slate-300">
          <Text text={b.text} highlights={highlights} />
        </blockquote>
      );
    } else if (b.type === "code") {
      out.push(
        <pre key={i} className="overflow-x-auto rounded-lg bg-slate-950/70 p-3 text-xs text-slate-200">
          {b.text}
        </pre>
      );
    } else {
      out.push(
        <p key={i}>
          <Text text={b.text} highlights={highlights} />
        </p>
      );
    }
  }
  return <>{out}</>;
}
