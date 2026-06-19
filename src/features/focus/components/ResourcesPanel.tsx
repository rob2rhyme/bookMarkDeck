"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink } from "@/components/icons";
import type { Bookmark } from "@/types/bookmark";

type ResourcesPanelProps = {
  folderName: string;
  bookmarks: Bookmark[];
};

function faviconFor(rawUrl: string): string {
  try {
    const url = new URL(
      rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`
    );
    if (!url.hostname.includes(".")) return "";
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
      url.hostname
    )}`;
  } catch {
    return "";
  }
}

/**
 * Read-only panel showing the linked collection's bookmarks so the user's saved
 * resources are right there while they work. Opens links in a new tab.
 */
export function ResourcesPanel({ folderName, bookmarks }: ResourcesPanelProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-sm sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Resources
        </h3>
        <span className="max-w-[55%] truncate text-xs text-slate-500">
          {folderName}
        </span>
      </div>

      {bookmarks.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          No bookmarks in this collection yet.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {bookmarks.map((bookmark) => {
            const favicon = faviconFor(bookmark.url);
            return (
              <li key={bookmark.id}>
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition hover:border-slate-800 hover:bg-slate-950/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800 text-xs font-semibold text-slate-300">
                    {favicon ? (
                      <img
                        src={favicon}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5"
                      />
                    ) : (
                      (bookmark.title || bookmark.url || "?")
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-200">
                    {bookmark.title || bookmark.url}
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-slate-300" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ResourcesPanel;
