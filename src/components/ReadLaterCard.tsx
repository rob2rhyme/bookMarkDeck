"use client";

import { useState } from "react";

import { ReaderModal } from "@/components/ReaderModal";
import type { Bookmark } from "@/types/bookmark";
import { normalizeUrl } from "@/utils/normalizeUrl";
import { dequeuePatch, readPatch, readingQueue, waitingLabel } from "@/utils/readLater";

const SHOWN = 5;

function host(url: string): string {
  try {
    return new URL(normalizeUrl(url) || url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The read-later queue, oldest first so nothing sits forgotten behind newer
 * arrivals. Derived from the bookmarks' own timestamps — there is no separate list.
 * Renders nothing when the queue is empty.
 */
export function ReadLaterCard({
  bookmarks,
  onUpdate,
}: {
  bookmarks: Bookmark[];
  onUpdate: (id: string, patch: Partial<Bookmark>) => void;
}) {
  const queue = readingQueue(bookmarks);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Looked up in all bookmarks, not the queue: marking it read inside the dialog
  // takes it out of the queue but shouldn't close the dialog under the reader.
  const open = openId ? (bookmarks.find((b) => b.id === openId) ?? null) : null;

  if (queue.length === 0 && !open) return null;
  const rows = showAll ? queue : queue.slice(0, SHOWN);

  return (
    <>
      {queue.length > 0 && (
        <section
          aria-label="Read later"
          className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Read later <span className="text-slate-400">· {queue.length}</span>
            </p>
            {queue.length > SHOWN && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs text-blue-300 underline-offset-2 hover:underline"
              >
                {showAll ? "Show fewer" : `Show all ${queue.length}`}
              </button>
            )}
          </div>
          <ul className="mt-2 flex flex-col divide-y divide-slate-800/70">
            {rows.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{b.title || host(b.url)}</p>
                  <p className="truncate text-xs text-slate-400">
                    {host(b.url)}
                    {b.readLaterAt ? ` · waiting ${waitingLabel(b.readLaterAt)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Read ${b.title || host(b.url)}`}
                  onClick={() => setOpenId(b.id)}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
                >
                  Read
                </button>
                <button
                  type="button"
                  aria-label={`Mark ${b.title || host(b.url)} as read`}
                  onClick={() => onUpdate(b.id, readPatch())}
                  className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                >
                  Done
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${b.title || host(b.url)} from the queue`}
                  onClick={() => onUpdate(b.id, dequeuePatch())}
                  className="shrink-0 rounded-lg px-1.5 py-1.5 text-xs text-slate-500 transition hover:text-slate-200"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && (
        <ReaderModal
          bookmark={open}
          open
          onClose={() => setOpenId(null)}
          onHighlightsChange={(next) => onUpdate(open.id, { highlights: next })}
          onReadLaterChange={(patch) => onUpdate(open.id, patch)}
        />
      )}
    </>
  );
}

export default ReadLaterCard;
