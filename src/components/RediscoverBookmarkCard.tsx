"use client";

import type { Bookmark } from "@/types/bookmark";
import { normalizeUrl } from "@/utils/normalizeUrl";

function host(url: string): string {
  try {
    return new URL(normalizeUrl(url) || url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function RediscoverBookmarkCard({
  bookmark,
  onOpen,
  onDismiss,
}: {
  bookmark: Bookmark;
  onOpen: (b: Bookmark) => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Rediscover a bookmark"
      className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Rediscover
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-100">
            {bookmark.title || host(bookmark.url)}
          </p>
          <p className="truncate text-xs text-slate-400">{host(bookmark.url)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(bookmark)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
          >
            Open
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
