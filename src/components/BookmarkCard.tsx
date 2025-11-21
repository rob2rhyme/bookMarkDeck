//src/components/BookmarkCard.tsx
"use client";

import { Bookmark } from "@/types/bookmark";
import { useState } from "react";

function getThumbnailUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    // Full-page screenshot thumbnail using external screenshot service.
    // You can swap this URL pattern for another provider if you prefer.
    return `https://image.thum.io/get/width/800/crop/600/noanimate/${encodeURIComponent(
      url.href
    )}`;
  } catch {
    return null;
  }
}

function getFaviconUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
      url.origin
    )}`;
  } catch {
    return null;
  }
}

type Props = {
  bookmark: Bookmark;
  onUpdate: (id: string, data: Partial<Bookmark>) => void;
  onDelete: (id: string) => void;
};

export function BookmarkCard({ bookmark, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState(bookmark.title ?? "");
  const [url, setUrl] = useState(bookmark.url ?? "");
  const [folder, setFolder] = useState(bookmark.folder ?? "");
  const [tagsInput, setTagsInput] = useState((bookmark.tags ?? []).join(", "));
  const [note, setNote] = useState(bookmark.note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const persistChanges = () => {
    const nextTitle = (title || url || bookmark.title).trim();
    const nextUrl = (url || bookmark.url).trim();
    const nextFolder = folder.trim() || undefined;
    const nextTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const changed =
      nextTitle !== bookmark.title ||
      nextUrl !== bookmark.url ||
      nextFolder !== bookmark.folder ||
      note !== (bookmark.note ?? "") ||
      JSON.stringify(nextTags) !== JSON.stringify(bookmark.tags ?? []);

    if (!changed) return;

    onUpdate(bookmark.id, {
      title: nextTitle,
      url: nextUrl,
      folder: nextFolder,
      note,
      tags: nextTags,
    });
  };

  const handleOpen = () => {
    const finalUrl = (isEditing ? url : bookmark.url).trim();
    if (!finalUrl) return;
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  };

  const handleEditClick = () => {
    // enter edit mode, reset local state from latest bookmark
    if (!isEditing) {
      setTitle(bookmark.title ?? "");
      setUrl(bookmark.url ?? "");
      setFolder(bookmark.folder ?? "");
      setTagsInput((bookmark.tags ?? []).join(", "));
      setNote(bookmark.note ?? "");
      setIsEditing(true);
    } else {
      // already editing -> treat as save
      persistChanges();
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTitle(bookmark.title ?? "");
    setUrl(bookmark.url ?? "");
    setFolder(bookmark.folder ?? "");
    setTagsInput((bookmark.tags ?? []).join(", "));
    setNote(bookmark.note ?? "");
  };

  const tags = bookmark.tags ?? [];

  const thumbnail = getThumbnailUrl(bookmark.url);
  const favicon = getFaviconUrl(bookmark.url);

  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80">
      <div className="p-4 space-y-3">
        {/* Screenshot thumbnail (falls back to favicon banner on error) */}
        {!isEditing && thumbnail && !thumbError && (
          <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-slate-950/10 dark:border-slate-700/60">
            <img
              src={thumbnail}
              alt=""
              className="h-32 w-full object-cover"
              loading="lazy"
              onError={() => setThumbError(true)}
            />
          </div>
        )}

        {/* Fallback: favicon + title strip when screenshot fails or is unavailable */}
        {!isEditing && (!thumbnail || thumbError) && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-950/20 px-3 py-2 dark:border-slate-700/60">
            {favicon && (
              <img
                src={favicon}
                alt=""
                className="h-7 w-7 shrink-0 rounded-md border border-slate-700/60 bg-slate-900 object-contain"
                loading="lazy"
              />
            )}
            <span className="line-clamp-1 text-xs font-medium text-slate-200 dark:text-slate-100">
              {bookmark.title || bookmark.url}
            </span>
          </div>
        )}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            {isEditing ? (
              <>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full truncate rounded-md border border-slate-300 bg-white/80 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full truncate rounded-md border border-slate-300 bg-white/80 px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                />
              </>
            ) : (
              <>
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 break-words text-sm font-semibold text-slate-900 hover:text-blue-600 dark:text-slate-50 dark:hover:text-blue-400"
                >
                  {bookmark.title}
                </a>
                <p className="mt-1 line-clamp-1 break-all text-xs text-slate-500 dark:text-slate-400">
                  {bookmark.url}
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isEditing && (
              <button
                onClick={handleCancel}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label="Cancel edit"
              >
                ⟲
              </button>
            )}
            <button
              onClick={handleEditClick}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-slate-800"
              aria-label={isEditing ? "Save changes" : "Edit bookmark"}
            >
              {isEditing ? "✔︎" : "✏️"}
            </button>
            <button
              onClick={() => onDelete(bookmark.id)}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
              aria-label="Delete bookmark"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Folder + tags row */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Folder (optional)"
                className="max-w-[50%] rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              />
            ) : (
              bookmark.folder && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {bookmark.folder}
                </span>
              )
            )}

            {!isEditing && tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isEditing && (
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Tags (comma separated)"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            />
          )}
        </div>

        {/* Note */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Note
          </label>
          {isEditing ? (
            <textarea
              className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 outline-none ring-0 transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              placeholder="Add login hints, purpose, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          ) : (
            <p className="h-20 overflow-auto rounded-xl border border-transparent bg-slate-950/5 px-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-300">
              {bookmark.note || "Add login hints, purpose, etc."}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <span>
          {new Date(bookmark.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {!isEditing && (
          <button
            type="button"
            onClick={handleOpen}
            className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}
