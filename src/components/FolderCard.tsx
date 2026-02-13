"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

import { FolderTree } from "@/components/icons";
import { Bookmark } from "@/types/bookmark";

type FolderCardProps = {
  name: string;
  count: number;
  subfolderCount?: number;
  previews?: Bookmark[];
  previewBookmarks?: Bookmark[];
  onOpen: () => void;
  isUnstaged?: boolean;
  isEmpty?: boolean;
  selectMode?: boolean;
  isSelected?: boolean;
  isSelectable?: boolean;
  onToggleSelect?: () => void;
  hasChildren?: boolean;
  childFolders?: Array<{ id: string; name: string; bookmarkCount: number }>;
  showChildPreview?: boolean;
};

function getHostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    try {
      return new URL(`https://${rawUrl}`).hostname;
    } catch {
      return rawUrl;
    }
  }
}

function getFaviconUrl(rawUrl: string): string {
  const resolve = (value: string) => {
    try {
      const url = new URL(value);
      const host = url.hostname;
      if (!host || !host.includes(".")) return "";
      return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
    } catch {
      return "";
    }
  };

  const direct = resolve(rawUrl);
  if (direct) return direct;
  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
    return resolve(`https://${rawUrl}`);
  }
  return "";
}

function firstLetterFromUrlOrTitle(url: string, title?: string): string {
  const hostname = getHostname(url).replace(/^www\./i, "");
  if (hostname) return hostname[0]?.toUpperCase() ?? "A";
  const fromTitle = (title ?? "").trim();
  return fromTitle ? fromTitle[0].toUpperCase() : "A";
}

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function FolderPreviewTile({ bookmark }: { bookmark: Bookmark }) {
  const iconValue = (bookmark.icon ?? "").trim();
  const iconUrl = isHttpUrl(iconValue) ? iconValue : "";
  const favicon = getFaviconUrl(bookmark.url);
  const initial = firstLetterFromUrlOrTitle(bookmark.url, bookmark.title);
  const [iconFailed, setIconFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const shouldShowIconUrl = iconUrl && !iconFailed;
  const shouldShowFavicon = favicon && !faviconFailed;
  const shouldShowIconText = !shouldShowIconUrl && !shouldShowFavicon && iconValue.length > 0;

  return (
    <div className="flex aspect-square h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-[12px] font-semibold uppercase text-slate-100 ring-1 ring-white/5 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_25px_-18px_rgba(0,0,0,0.9)]">
      {shouldShowIconUrl ? (
        <img
          src={iconUrl}
          alt=""
          width={32}
          height={32}
          className="block h-11 w-11 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIconFailed(true)}
        />
      ) : shouldShowFavicon ? (
        <img
          src={favicon}
          alt=""
          width={32}
          height={32}
          className="block h-11 w-11 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFaviconFailed(true)}
        />
      ) : shouldShowIconText ? (
        <span>{iconValue}</span>
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

export function FolderCard({
  name,
  count,
  subfolderCount = 0,
  previews,
  previewBookmarks,
  onOpen,
  isUnstaged,
  isEmpty,
  selectMode,
  isSelected,
  isSelectable,
  onToggleSelect,
  hasChildren,
  childFolders,
  showChildPreview,
}: FolderCardProps) {
  const previewBookmarksToShow = (previewBookmarks ?? previews ?? []).slice(0, 16);
  const previewCount = previewBookmarksToShow.length;
  const useCompactPreviewLayout = previewCount <= 6;
  const sortedChildFolders = [...(childFolders ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const childPreviewItems = sortedChildFolders.slice(0, 3);
  const remainingChildCount = Math.max(0, sortedChildFolders.length - childPreviewItems.length);
  const shouldShowChildPreview = showChildPreview ?? sortedChildFolders.length > 0;

  return (
    <button
      type="button"
      onClick={() => {
        if (selectMode) {
          if (isSelectable) onToggleSelect?.();
          return;
        }
        onOpen();
      }}
      className={`group relative flex w-full flex-col gap-4 rounded-3xl border bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-950/80 p-6 text-left shadow-[0_20px_40px_-30px_rgba(0,0,0,0.8)] transition ${
        isSelected
          ? "border-blue-400 ring-2 ring-blue-400/60"
          : "border-slate-800/70 hover:-translate-y-0.5 hover:border-blue-500/50"
      } ${selectMode && !isSelectable ? "cursor-not-allowed opacity-80" : ""}`}
      aria-pressed={selectMode ? !!isSelected : undefined}
    >
      {selectMode && isSelectable && (
        <span className="absolute left-4 top-4 flex h-5 w-5 items-center justify-center rounded border border-slate-500 bg-slate-900/90 text-[11px] text-white">
          {isSelected ? "✓" : ""}
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{name}</p>
          <p className="text-[11px] text-slate-400">
            {count} bookmark{count !== 1 ? "s" : ""}
            {" • "}
            {subfolderCount} subfolder{subfolderCount !== 1 ? "s" : ""}
            {isUnstaged ? " · No folder yet" : ""}
            {isEmpty ? " · Empty" : ""}
          </p>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {hasChildren && (
            <span
              className="inline-flex items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/50 p-1 text-slate-200"
              title="Contains subfolders"
              aria-label="Contains subfolders"
            >
              <FolderTree className="h-4 w-4" />
            </span>
          )}
          <span className="rounded-full border border-slate-700/80 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            {selectMode ? (isSelectable ? "Select" : "Locked") : "Open"}
          </span>
        </div>
      </div>
      <div className="h-52 overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/40 p-3">
        {previewCount > 0 ? (
          useCompactPreviewLayout ? (
            <div className="mx-auto flex h-full w-fit max-w-full flex-wrap content-start items-center justify-center gap-2.5">
              {previewBookmarksToShow.map((bookmark, index) => (
                <FolderPreviewTile key={`${bookmark.id}-${index}`} bookmark={bookmark} />
              ))}
              {count > 16 && (
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold text-slate-100 ring-1 ring-white/5">
                  +{count - 16}
                </div>
              )}
            </div>
          ) : (
            <div className="bd-tile-grid mx-auto h-full w-fit max-w-full place-content-center place-items-center [--tile-gap:10px] [--tile-max:56px] [--tile-min:56px]">
              {previewBookmarksToShow.map((bookmark, index) => (
                <FolderPreviewTile key={`${bookmark.id}-${index}`} bookmark={bookmark} />
              ))}
              {count > 16 && (
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold text-slate-100 ring-1 ring-white/5">
                  +{count - 16}
                </div>
              )}
            </div>
          )
        ) : shouldShowChildPreview && childPreviewItems.length > 0 ? (
          <div className="grid h-full content-start grid-cols-1 gap-2 sm:grid-cols-2">
            {childPreviewItems.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-950/30 px-2.5 py-2"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/60 text-slate-200">
                  <FolderTree className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-100">{folder.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {folder.bookmarkCount} bookmark{folder.bookmarkCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))}
            {remainingChildCount > 0 && (
              <div className="inline-flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/40 px-2.5 py-2 text-[11px] font-semibold text-slate-200">
                +{remainingChildCount} more
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 text-xs text-slate-500">
            No bookmarks yet
          </div>
        )}
      </div>
    </button>
  );
}
