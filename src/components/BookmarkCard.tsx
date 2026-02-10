//src/components/BookmarkCard.tsx
"use client";
/* eslint-disable @next/next/no-img-element */
import { Bookmark } from "@/types/bookmark";
import { useState, useEffect } from "react";

function safeParseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    try {
      return new URL(`https://${rawUrl}`);
    } catch {
      return null;
    }
  }
}

function getFaviconCandidates(rawUrl: string): string[] {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return [];
  const host = parsed.hostname;
  if (!host || !host.includes(".")) return [];
  // favicon candidate fallback logic
  return [
    `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
    `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`,
    `${parsed.origin}/favicon.ico`,
  ];
}

type Props = {
  bookmark: Bookmark;
  onUpdate: (id: string, data: Partial<Bookmark>) => void;
  onDelete: (id: string) => void;
  usageLabel?: string;
  folders: string[];
  onCreateFolder?: (name: string) => void;
  onRequestNewFolder?: (onCreated: (name: string) => void) => void;
};

function firstLetterFromUrlOrTitle(url: string, title?: string): string {
  const extract = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.replace(/^www\./i, "");
      return host[0]?.toUpperCase() ?? "";
    } catch {
      return "";
    }
  };
  const fromUrl = extract(url) || extract(`https://${url}`);
  if (fromUrl) return fromUrl;
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

export function BookmarkCard({
  bookmark,
  onUpdate,
  onDelete,
  usageLabel,
  folders,
  onCreateFolder,
  onRequestNewFolder,
}: Props) {
  const [title, setTitle] = useState(bookmark.title ?? "");
  const [url, setUrl] = useState(bookmark.url ?? "");
  const [icon, setIcon] = useState(bookmark.icon ?? "");
  const [folder, setFolder] = useState(bookmark.folder ?? "");
  const [tagsInput, setTagsInput] = useState((bookmark.tags ?? []).join(", "));
  const [note, setNote] = useState(bookmark.note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const faviconCandidates = getFaviconCandidates(bookmark.url);
  const [faviconState, setFaviconState] = useState<{
    url: string;
    index: number;
  }>({ url: bookmark.url ?? "", index: 0 });
  const faviconIndex =
    faviconState.url === (bookmark.url ?? "") ? faviconState.index : 0;
  const favicon = faviconCandidates[faviconIndex];
  const initial = firstLetterFromUrlOrTitle(bookmark.url, bookmark.title);
  const editFaviconCandidates = getFaviconCandidates(url);
  const [editFaviconState, setEditFaviconState] = useState<{
    url: string;
    index: number;
  }>({ url: url ?? "", index: 0 });
  const editFaviconIndex =
    editFaviconState.url === (url ?? "") ? editFaviconState.index : 0;
  const editFavicon = editFaviconCandidates[editFaviconIndex];
  const editInitial = firstLetterFromUrlOrTitle(url, title);
  const viewIconValue = (bookmark.icon ?? "").trim();
  const editIconValue = icon.trim();
  const viewIconUrl = isHttpUrl(viewIconValue) ? viewIconValue : null;
  const editIconUrl = isHttpUrl(editIconValue) ? editIconValue : null;
  const DEFAULT_BORDER_COLOR = "rgba(148,163,184,0.25)";
  const [borderColorState, setBorderColorState] = useState<{
    url: string;
    color: string;
  } | null>(null);
  const [iconImgFailedFor, setIconImgFailedFor] = useState<string | null>(null);
  const [editIconImgFailedFor, setEditIconImgFailedFor] = useState<string | null>(
    null
  );

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

        setBorderColorState({ url: favicon, color: `rgba(${r}, ${g}, ${b}, 0.9)` });
      } catch {
        setBorderColorState(null);
      }
    };

    img.onerror = () => {
      if (!isCancelled) {
        setBorderColorState(null);
        setFaviconState((current) => {
          const urlKey = bookmark.url ?? "";
          const baseIndex = current.url === urlKey ? current.index : 0;
          const nextIndex =
            baseIndex + 1 < faviconCandidates.length ? baseIndex + 1 : baseIndex;
          return { url: urlKey, index: nextIndex };
        });
      }
    };

    return () => {
      isCancelled = true;
    };
  }, [favicon, faviconCandidates.length, bookmark.url]);

  const shouldShowFavicon = Boolean(favicon);
  const shouldShowEditFavicon = Boolean(editFavicon);
  const shouldShowIconUrl = viewIconUrl && iconImgFailedFor !== viewIconUrl;
  const shouldShowEditIconUrl =
    editIconUrl && editIconImgFailedFor !== editIconUrl;
  const shouldShowIconText = !shouldShowIconUrl && !shouldShowFavicon && viewIconValue.length > 0;
  const shouldShowEditIconText =
    !shouldShowEditIconUrl && !shouldShowEditFavicon && editIconValue.length > 0;
  const effectiveBorderColor = shouldShowFavicon
    ? borderColorState?.url === favicon
      ? borderColorState.color
      : DEFAULT_BORDER_COLOR
    : DEFAULT_BORDER_COLOR;

  const persistChanges = () => {
    const nextTitle = (title || url || bookmark.title).trim();
    const nextUrl = (url || bookmark.url).trim();
    const nextIcon = icon.trim() || undefined;
    const nextFolder = folder.trim() || undefined;
    const nextTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const changed =
      nextTitle !== bookmark.title ||
      nextUrl !== bookmark.url ||
      nextIcon !== bookmark.icon ||
      nextFolder !== bookmark.folder ||
      note !== (bookmark.note ?? "") ||
      JSON.stringify(nextTags) !== JSON.stringify(bookmark.tags ?? []);

    if (!changed) return;

    onUpdate(bookmark.id, {
      title: nextTitle,
      url: nextUrl,
      icon: nextIcon,
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
      setIcon(bookmark.icon ?? "");
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
    setIcon(bookmark.icon ?? "");
    setFolder(bookmark.folder ?? "");
    setTagsInput((bookmark.tags ?? []).join(", "));
    setNote(bookmark.note ?? "");
    setShowNote(false);
  };

  const tags = bookmark.tags ?? [];

  const handleTogglePinned = () => {
    onUpdate(bookmark.id, { pinned: !bookmark.pinned });
  };

  const handleFolderChange = (value: string) => {
    if (value === "__new__") {
      if (onRequestNewFolder) {
        onRequestNewFolder((name) => {
          if (onCreateFolder) onCreateFolder(name);
          setFolder(name);
        });
        return;
      }
      return;
    }
    if (value === "__unstaged__") {
      setFolder("");
      return;
    }
    setFolder(value);
  };

  const currentFolderValue = folder.trim() || "__unstaged__";

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
          {isEditing ? (
            shouldShowEditIconUrl ? (
              <img
                src={editIconUrl ?? ""}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl border border-slate-700/40 bg-slate-900 object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => {
                  if (editIconUrl) setEditIconImgFailedFor(editIconUrl);
                }}
              />
            ) : shouldShowEditFavicon ? (
              <img
                src={editFavicon ?? ""}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl border border-slate-700/40 bg-slate-900 object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => {
                setEditFaviconState((current) => {
                  const urlKey = url ?? "";
                  const baseIndex = current.url === urlKey ? current.index : 0;
                  const nextIndex =
                    baseIndex + 1 < editFaviconCandidates.length
                      ? baseIndex + 1
                      : baseIndex;
                  return { url: urlKey, index: nextIndex };
                });
              }}
            />
            ) : shouldShowEditIconText ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800 text-sm font-semibold uppercase text-slate-100">
                {editIconValue}
              </span>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800 text-sm font-semibold uppercase text-slate-100">
                {editInitial}
              </span>
            )
          ) : shouldShowIconUrl ? (
            <img
              src={viewIconUrl ?? ""}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl border border-slate-700/40 bg-slate-900 object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => {
                if (viewIconUrl) setIconImgFailedFor(viewIconUrl);
              }}
            />
          ) : shouldShowFavicon ? (
            <img
              src={favicon}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl border border-slate-700/40 bg-slate-900 object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => {
                setFaviconState((current) => {
                  const urlKey = bookmark.url ?? "";
                  const baseIndex = current.url === urlKey ? current.index : 0;
                  const nextIndex =
                    baseIndex + 1 < faviconCandidates.length
                      ? baseIndex + 1
                      : baseIndex;
                  return { url: urlKey, index: nextIndex };
                });
              }}
            />
          ) : shouldShowIconText ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800 text-sm font-semibold uppercase text-slate-100">
              {viewIconValue}
            </span>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800 text-sm font-semibold uppercase text-slate-100">
              {initial}
            </span>
          )}
          <span className="line-clamp-2 text-[11px] font-medium text-slate-900 dark:text-slate-50">
            {isEditing ? title || url : bookmark.title || bookmark.url}
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
          {!isEditing ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-950/20 px-3 py-2 dark:border-slate-700/60">
              {shouldShowIconUrl ? (
                <img
                  src={viewIconUrl ?? ""}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-md border border-slate-700/60 bg-slate-900 object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (viewIconUrl) setIconImgFailedFor(viewIconUrl);
                  }}
                />
              ) : shouldShowFavicon ? (
                <img
                  src={favicon}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-md border border-slate-700/60 bg-slate-900 object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    setFaviconState((current) => {
                      const urlKey = bookmark.url ?? "";
                      const baseIndex = current.url === urlKey ? current.index : 0;
                      const nextIndex =
                        baseIndex + 1 < faviconCandidates.length
                          ? baseIndex + 1
                          : baseIndex;
                      return { url: urlKey, index: nextIndex };
                    });
                  }}
                />
              ) : shouldShowIconText ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800 text-[11px] font-semibold uppercase text-slate-100">
                  {viewIconValue}
                </span>
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800 text-[11px] font-semibold uppercase text-slate-100">
                  {initial}
                </span>
              )}
              <span className="line-clamp-1 text-xs font-medium text-slate-200 dark:text-slate-100">
                {bookmark.title || bookmark.url}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-950/20 px-3 py-2 dark:border-slate-700/60">
              {shouldShowEditIconUrl ? (
                <img
                  src={editIconUrl ?? ""}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-md border border-slate-700/60 bg-slate-900 object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (editIconUrl) setEditIconImgFailedFor(editIconUrl);
                  }}
                />
              ) : shouldShowEditFavicon ? (
                <img
                  src={editFavicon ?? ""}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-md border border-slate-700/60 bg-slate-900 object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    setEditFaviconState((current) => {
                      const urlKey = url ?? "";
                      const baseIndex = current.url === urlKey ? current.index : 0;
                      const nextIndex =
                        baseIndex + 1 < editFaviconCandidates.length
                          ? baseIndex + 1
                          : baseIndex;
                      return { url: urlKey, index: nextIndex };
                    });
                  }}
                />
              ) : shouldShowEditIconText ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800 text-[11px] font-semibold uppercase text-slate-100">
                  {editIconValue}
                </span>
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800 text-[11px] font-semibold uppercase text-slate-100">
                  {editInitial}
                </span>
              )}
              <span className="line-clamp-1 text-xs font-medium text-slate-200 dark:text-slate-100">
                {title || url}
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
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Icon (emoji or image URL)
                    </label>
                    <input
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="😀 or https://example.com/icon.png"
                      className="w-full truncate rounded-md border border-slate-300 bg-white/80 px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                    />
                  </div>
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
                <div className="flex items-center gap-2">
                  <select
                    value={currentFolderValue}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    aria-label="Folder"
                  >
                    <option value="__unstaged__">Unstaged</option>
                    {folders.map((folderName) => (
                      <option key={folderName} value={folderName}>
                        {folderName}
                      </option>
                    ))}
                    <option value="__new__">New folder…</option>
                  </select>
                </div>
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
