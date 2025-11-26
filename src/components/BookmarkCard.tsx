//src/components/BookmarkCard.tsx
"use client";
/* eslint-disable @next/next/no-img-element */
import { Bookmark } from "@/types/bookmark";
import { useState, useEffect } from "react";

function getFaviconUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    // Skip empty hosts and bare words (no dot) to avoid noisy 404s.
    if (!host || !host.includes(".")) return null;
    // Google s2 service returns a fallback icon instead of 404s.
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
      host
    )}`;
  } catch {
    return null;
  }
}

type Props = {
  bookmark: Bookmark;
  onUpdate: (id: string, data: Partial<Bookmark>) => void;
  onDelete: (id: string) => void;
  usageLabel?: string;
};

export function BookmarkCard({ bookmark, onUpdate, onDelete, usageLabel }: Props) {
  const [title, setTitle] = useState(bookmark.title ?? "");
  const [url, setUrl] = useState(bookmark.url ?? "");
  const [folder, setFolder] = useState(bookmark.folder ?? "");
  const [tagsInput, setTagsInput] = useState((bookmark.tags ?? []).join(", "));
  const [note, setNote] = useState(bookmark.note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const favicon = getFaviconUrl(bookmark.url);
  const DEFAULT_BORDER_COLOR = "rgba(148,163,184,0.25)";
  const [borderColor, setBorderColor] = useState<string>(DEFAULT_BORDER_COLOR);

  useEffect(() => {
    if (!favicon) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = favicon;
    let isCancelled = false;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width || 32;
        canvas.height = img.height || 32;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }

        if (!count) return;

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        setBorderColor(`rgba(${r}, ${g}, ${b}, 0.9)`);
      } catch {
        setBorderColor(DEFAULT_BORDER_COLOR);
      }
    };

    img.onerror = () => {
      if (!isCancelled) {
        setBorderColor(DEFAULT_BORDER_COLOR);
      }
    };

    return () => {
      isCancelled = true;
    };
  }, [favicon]);

  const effectiveBorderColor = favicon ? borderColor : DEFAULT_BORDER_COLOR;

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
    const nextHits = (bookmark.hits ?? 0) + 1;
    onUpdate(bookmark.id, {
      hits: nextHits,
      lastUsedAt: new Date().toISOString(),
    });
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
      setShowNote(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTitle(bookmark.title ?? "");
    setUrl(bookmark.url ?? "");
    setFolder(bookmark.folder ?? "");
    setTagsInput((bookmark.tags ?? []).join(", "));
    setNote(bookmark.note ?? "");
    setShowNote(false);
  };

  const tags = bookmark.tags ?? [];

  const handleTogglePinned = () => {
    onUpdate(bookmark.id, { pinned: !bookmark.pinned });
  };

  return (
    <div
      className="relative z-0 overflow-hidden rounded-2xl bg-white/80 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900/80"
      style={{
        border: `2px solid ${effectiveBorderColor}`,
      }}
    >
      {usageLabel && (
        <span className="absolute right-2 top-2 z-20 rounded-full bg-blue-600/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
          {usageLabel}
        </span>
      )}
      {/* MOBILE: compact icon-style card (4 per row) */}
      <div className="flex h-full flex-col justify-between p-2 sm:hidden">
        {/* row 1: actions (star far-left, delete on right) */}
        <div className="mb-1 flex items-center justify-between px-1">
          <div className="flex items-center">
            {!isEditing && (
              <button
                onClick={handleTogglePinned}
                className="
                  rounded-full
                  p-2
                  text-sm
                  text-slate-100
                  hover:bg-slate-800 hover:text-amber-300
                "
                aria-label={bookmark.pinned ? "Unpin bookmark" : "Pin bookmark"}
                aria-pressed={bookmark.pinned}
              >
                {bookmark.pinned ? "★" : "☆"}
              </button>
            )}
          </div>

          <button
            onClick={() => onDelete(bookmark.id)}
            className="
              rounded-full
              p-2
              text-sm
              text-slate-100
              hover:bg-slate-800 hover:text-red-400
            "
            aria-label="Delete bookmark"
          >
            ✕
          </button>
        </div>

        {/* main icon + title */}
        <button
          type="button"
          onClick={handleOpen}
          className="mt-1 flex flex-col items-center gap-1 rounded-xl bg-slate-950/10 px-2 py-3 text-center hover:bg-slate-950/20"
        >
          {favicon && (
            <img
              src={favicon}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl border border-slate-700/40 bg-slate-900 object-contain"
              loading="lazy"
            />
          )}
          <span className="line-clamp-2 text-[11px] font-medium text-slate-900 dark:text-slate-50">
            {bookmark.title || bookmark.url}
          </span>
        </button>

        {/* row 2: Open button full-width at bottom */}
        {!isEditing && (
          <button
            type="button"
            onClick={handleOpen}
            className="mt-2 w-full rounded-full bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
          >
            Open
          </button>
        )}
      </div>

      {/* TABLET / DESKTOP: full detailed card */}
      <div className="hidden h-full flex-col justify-between sm:flex">
        <div className="relative z-10 space-y-3 p-4">
          {/* favicon + title strip */}
          {!isEditing && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-950/20 px-3 py-2 dark:border-slate-700/60">
              {favicon && (
                <img
                  src={favicon}
                  alt=""
                  width={28}
                  height={28}
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
              {!isEditing && (
                <button
                  onClick={handleTogglePinned}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-amber-400 dark:hover:bg-slate-800"
                  aria-label={
                    bookmark.pinned ? "Unpin bookmark" : "Pin bookmark"
                  }
                >
                  {bookmark.pinned ? "★" : "☆"}
                </button>
              )}

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
              <span className="flex items-center gap-2">
                <span>Note</span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setShowNote((prev) => !prev)}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label={showNote ? "Hide note" : "Show note"}
                  >
                    {showNote ? "🙈 Hide" : "🔒 Show"}
                  </button>
                )}
              </span>
            </label>
            {isEditing ? (
              <textarea
                className="h-20 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none ring-0 transition focus:border-blue-500 focus:bg-slate-950 focus:ring-2 focus:ring-blue-900/40"
                placeholder="Add login hints, purpose, etc."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            ) : (
              <div className="h-20 overflow-auto rounded-xl border border-transparent bg-slate-950/5 px-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-300">
                {showNote
                  ? bookmark.note || "Add login hints, purpose, etc."
                  : bookmark.note
                  ? "••••••••"
                  : "Add login hints, purpose, etc."}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
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
    </div>
  );
}
