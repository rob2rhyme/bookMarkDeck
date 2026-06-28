//src/components/BookmarkCard.tsx
"use client";
/* eslint-disable @next/next/no-img-element */
import { Bookmark } from "@/types/bookmark";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { IconAction } from "@/components/IconAction";
import { NoteText } from "@/components/NoteText";
import { BulletButton } from "@/components/BulletButton";
import { appendBullet } from "@/utils/noteFormat";
import {
  Check,
  Emoji,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  Star,
  StarFilled,
  Timer,
  Trash,
  X,
} from "@/components/icons";
import { hapticTap } from "@/utils/haptics";
import { setFocusTaskIntent } from "@/lib/focusIntent";
import { setBookmarkFocusLink } from "@/lib/bookmarkFocusLink";
import { useToast } from "@/components/toast/ToastProvider";

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
  folderOptions: Array<{ id: string; name: string; label: string }>;
  folderName?: string;
  onRequestNewFolder?: (onCreated: (folderId: string) => void) => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
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
  folderOptions,
  folderName,
  onRequestNewFolder,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: Props) {
  const [title, setTitle] = useState(bookmark.title ?? "");
  const [url, setUrl] = useState(bookmark.url ?? "");
  const [icon, setIcon] = useState(bookmark.icon ?? "");
  const [folderId, setFolderId] = useState<string>(
    typeof bookmark.folderId === "string" ? bookmark.folderId : "__unstaged__"
  );
  const [tagsInput, setTagsInput] = useState((bookmark.tags ?? []).join(", "));
  const [note, setNote] = useState(bookmark.note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

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
  const clearBookmarkFavicon = useCallback(() => {
    const urlKey = bookmark.url ?? "";
    setFaviconState({ url: urlKey, index: faviconCandidates.length });
  }, [bookmark.url, faviconCandidates.length]);

  const clearEditFavicon = useCallback(() => {
    const urlKey = url ?? "";
    setEditFaviconState({ url: urlKey, index: editFaviconCandidates.length });
  }, [url, editFaviconCandidates.length]);

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
        clearBookmarkFavicon();
      }
    };

    return () => {
      isCancelled = true;
    };
  }, [clearBookmarkFavicon, favicon, faviconCandidates.length, bookmark.url]);

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
  const hideBrokenFavicon = (img: HTMLImageElement) => {
    img.onerror = null;
    img.src = "";
  };

  const folderNameById = new Map(
    folderOptions.map((option) => [option.id, option.name])
  );

  const persistChanges = () => {
    const nextTitle = (title || url || bookmark.title).trim();
    const nextUrl = (url || bookmark.url).trim();
    const nextIcon = icon.trim() || undefined;
    const nextFolderId = folderId === "__unstaged__" ? null : folderId;
    const nextFolder =
      nextFolderId && folderNameById.has(nextFolderId)
        ? folderNameById.get(nextFolderId)
        : undefined;
    const nextTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const changed =
      nextTitle !== bookmark.title ||
      nextUrl !== bookmark.url ||
      nextIcon !== bookmark.icon ||
      nextFolderId !== (bookmark.folderId ?? null) ||
      nextFolder !== bookmark.folder ||
      note !== (bookmark.note ?? "") ||
      JSON.stringify(nextTags) !== JSON.stringify(bookmark.tags ?? []);

    if (!changed) return;

    onUpdate(bookmark.id, {
      title: nextTitle,
      url: nextUrl,
      icon: nextIcon,
      folderId: nextFolderId,
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
      setFolderId(
        typeof bookmark.folderId === "string" ? bookmark.folderId : "__unstaged__"
      );
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
    setFolderId(
      typeof bookmark.folderId === "string" ? bookmark.folderId : "__unstaged__"
    );
    setTagsInput((bookmark.tags ?? []).join(", "));
    setNote(bookmark.note ?? "");
    setShowNote(false);
  };

  const tags = bookmark.tags ?? [];

  const handleTogglePinned = () => {
    onUpdate(bookmark.id, { pinned: !bookmark.pinned });
  };

  // Cohesion: turn this resource into focused work. Seed a Focus task from the
  // bookmark and jump to the Focus hub, which picks the intent up on mount.
  const handleWorkOnThis = () => {
    const seed = (bookmark.title || bookmark.url).trim();
    if (!seed) return;
    setFocusTaskIntent(seed);
    setBookmarkFocusLink(bookmark.id, seed); // reconciled on return if a block completes
    toast(`Starting focus on “${seed}”`, { variant: "success" });
    router.push("/focus");
  };

  const handleFolderChange = (value: string) => {
    if (value === "__new__") {
      if (onRequestNewFolder) {
        onRequestNewFolder((createdFolderId) => {
          setFolderId(createdFolderId);
        });
        return;
      }
      return;
    }
    if (value === "__unstaged__") {
      setFolderId("__unstaged__");
      return;
    }
    setFolderId(value);
  };

  const currentFolderValue = folderId;
  const displayFolderName =
    folderName ??
    (typeof bookmark.folderId === "string"
      ? folderNameById.get(bookmark.folderId)
      : undefined) ??
    bookmark.folder;
  const hostnameForDisplay = (() => {
    const parsed = safeParseUrl(bookmark.url);
    if (parsed?.hostname) return parsed.hostname.replace(/^www\./i, "");
    return bookmark.url.replace(/^https?:\/\//i, "").split("/")[0];
  })();

  return (
    <div
      className={`relative z-0 overflow-hidden rounded-2xl bg-white/80 shadow-sm backdrop-blur-xl transition dark:bg-slate-900/80 ${
        selectMode
          ? "ring-2 ring-offset-0 " +
            (isSelected ? "ring-blue-400" : "ring-transparent")
          : "hover:-translate-y-0.5 hover:shadow-md"
      }`}
      style={{
        border: `2px solid ${effectiveBorderColor}`,
      }}
    >
      {selectMode && (
        <>
          <button
            type="button"
            onClick={() => onToggleSelect?.(bookmark.id)}
            className="absolute inset-0 z-30"
            aria-label={isSelected ? "Deselect bookmark" : "Select bookmark"}
            aria-pressed={isSelected}
          />
          <div className="pointer-events-none absolute left-2 top-2 z-40 flex h-5 w-5 items-center justify-center rounded border border-slate-500 bg-slate-900/90 text-[11px] text-white">
            {isSelected ? "✓" : ""}
          </div>
        </>
      )}
      {usageLabel && (
        <span className="absolute right-2 top-2 z-20 rounded-full bg-blue-600/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
          {usageLabel}
        </span>
      )}
      {/* MOBILE: premium compact layout */}
      <div className="space-y-3 p-3 sm:hidden">
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-700/70 bg-gradient-to-b from-slate-900/70 to-slate-950/80 p-2.5 ring-1 ring-white/5">
          <button
            type="button"
            onClick={handleOpen}
            disabled={selectMode || isEditing}
            className="shrink-0 rounded-lg border border-slate-700/70 bg-slate-900/60 p-1.5 disabled:cursor-default"
            aria-label={`Open ${bookmark.title || bookmark.url}`}
          >
            {isEditing ? (
              shouldShowEditIconUrl ? (
                <img
                  src={editIconUrl ?? ""}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md object-contain"
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
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    hideBrokenFavicon(event.currentTarget);
                    clearEditFavicon();
                  }}
                />
              ) : shouldShowEditIconText ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-xs font-semibold uppercase text-slate-100">
                  {editIconValue}
                </span>
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-xs font-semibold uppercase text-slate-100">
                  {editInitial}
                </span>
              )
            ) : shouldShowIconUrl ? (
              <img
                src={viewIconUrl ?? ""}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-md object-contain"
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
                width={32}
                height={32}
                className="h-8 w-8 rounded-md object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  hideBrokenFavicon(event.currentTarget);
                  clearBookmarkFavicon();
                }}
              />
            ) : shouldShowIconText ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-xs font-semibold uppercase text-slate-100">
                <Emoji>{viewIconValue}</Emoji>
              </span>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-xs font-semibold uppercase text-slate-100">
                {initial}
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ) : (
              <>
                <p className="line-clamp-2 text-sm font-semibold text-slate-100">
                  {bookmark.title || bookmark.url}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                  {hostnameForDisplay}
                </p>
              </>
            )}
          </div>

        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {isEditing ? (
            <div className="min-w-0 w-full space-y-2">
              <div className="min-w-0 flex-1">
                <select
                  value={currentFolderValue}
                  onChange={(e) => handleFolderChange(e.target.value)}
                  className="w-full truncate overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  aria-label="Folder"
                >
                  <option value="__unstaged__">Unstaged</option>
                  {folderOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                  <option value="__new__">New folder…</option>
                </select>
              </div>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Tags (comma separated)"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ) : (
            <>
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-blue-900/70 bg-blue-950/70 px-2 py-0.5 text-[10px] font-medium text-blue-200"
                >
                  #{tag}
                </span>
              ))}
            </>
          )}
        </div>

        {isEditing ? (
          <>
            <textarea
              className="h-20 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none ring-0 transition focus:border-blue-500 focus:bg-slate-950 focus:ring-2 focus:ring-blue-900/40"
              placeholder="Add login hints, purpose, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-1.5">
              <BulletButton onInsert={() => setNote((n) => appendBullet(n))} />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Note
              </span>
              {!selectMode && (
                <IconAction
                  label={showNote ? "Hide note" : "Show note"}
                  onClick={() => {
                    hapticTap();
                    setShowNote((prev) => !prev);
                  }}
                  active={showNote}
                  icon={
                    showNote ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )
                  }
                  className="h-8 w-8"
                />
              )}
            </div>
            {showNote ? (
              <NoteText
                text={bookmark.note || "Add login hints, purpose, etc."}
                className="block max-h-24 overflow-auto whitespace-pre-wrap leading-relaxed"
              />
            ) : (
              <p className="line-clamp-3 leading-relaxed">
                {bookmark.note ? "••••••••" : "Add login hints, purpose, etc."}
              </p>
            )}
          </div>
        )}

        {!selectMode && (
          <div className="mt-3 flex w-full items-center justify-evenly gap-2 border-t border-slate-800/70 pt-2">
            <IconAction
              label={bookmark.pinned ? "Unpin" : "Pin"}
              onClick={() => {
                hapticTap();
                handleTogglePinned();
              }}
              active={!!bookmark.pinned}
              icon={
                bookmark.pinned ? (
                  <StarFilled className="h-4 w-4" />
                ) : (
                  <Star className="h-4 w-4" />
                )
              }
            />
            <IconAction
              label="Open link"
              onClick={handleOpen}
              disabled={selectMode || isEditing}
              icon={<ExternalLink className="h-4 w-4" />}
            />
            <IconAction
              label="Work on this in Focus"
              onClick={() => {
                hapticTap();
                handleWorkOnThis();
              }}
              disabled={selectMode || isEditing}
              icon={<Timer className="h-4 w-4" />}
            />
            <IconAction
              label={isEditing ? "Save" : "Edit"}
              onClick={() => {
                hapticTap();
                handleEditClick();
              }}
              icon={
                isEditing ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )
              }
            />
            <IconAction
              label={isEditing ? "Cancel" : "Delete"}
              onClick={() => {
                hapticTap();
                if (isEditing) {
                  handleCancel();
                  return;
                }
                onDelete(bookmark.id);
              }}
              variant={isEditing ? "default" : "danger"}
              icon={
                isEditing ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Trash className="h-4 w-4" />
                )
              }
            />
          </div>
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
                  onError={(event) => {
                    hideBrokenFavicon(event.currentTarget);
                    clearBookmarkFavicon();
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
                  onError={(event) => {
                    hideBrokenFavicon(event.currentTarget);
                    clearEditFavicon();
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
                  {selectMode ? (
                    <p className="line-clamp-2 break-words text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {bookmark.title}
                    </p>
                  ) : (
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 break-words text-sm font-semibold text-slate-900 hover:text-blue-600 dark:text-slate-50 dark:hover:text-blue-400"
                    >
                      {bookmark.title}
                    </a>
                  )}
                  <p className="mt-1 line-clamp-1 break-all text-xs text-slate-500 dark:text-slate-400">
                    {bookmark.url}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Folder + tags row */}
          <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {isEditing ? (
                <div className="min-w-0 flex-1">
                  <select
                    value={currentFolderValue}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="w-full truncate overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    aria-label="Folder"
                  >
                    <option value="__unstaged__">Unstaged</option>
                    {folderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                    <option value="__new__">New folder…</option>
                  </select>
                </div>
              ) : (
                displayFolderName && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {displayFolderName}
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
                {!isEditing && !selectMode && (
                  <IconAction
                    label={showNote ? "Hide note" : "Show note"}
                    onClick={() => {
                      hapticTap();
                      setShowNote((prev) => !prev);
                    }}
                    active={showNote}
                    icon={
                      showNote ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )
                    }
                    className="h-8 w-8"
                  />
                )}
              </span>
            </label>
            {isEditing ? (
              <>
                <textarea
                  className="h-20 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none ring-0 transition focus:border-blue-500 focus:bg-slate-950 focus:ring-2 focus:ring-blue-900/40"
                  placeholder="Add login hints, purpose, etc."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mt-1.5">
                  <BulletButton onInsert={() => setNote((n) => appendBullet(n))} />
                </div>
              </>
            ) : (
              <div className="h-20 overflow-auto rounded-xl border border-transparent bg-slate-950/5 px-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-300">
                {showNote ? (
                  <NoteText
                    text={bookmark.note || "Add login hints, purpose, etc."}
                    className="whitespace-pre-wrap"
                  />
                ) : (
                  <span>
                    {bookmark.note ? "••••••••" : "Add login hints, purpose, etc."}
                  </span>
                )}
              </div>
            )}
          </div>

          {!selectMode && (
            <div className="mt-3 flex w-full items-center justify-evenly gap-2 border-t border-slate-200/70 pt-2 dark:border-slate-700/70">
              <IconAction
                label={bookmark.pinned ? "Unpin" : "Pin"}
                onClick={() => {
                  hapticTap();
                  handleTogglePinned();
                }}
                active={!!bookmark.pinned}
                icon={
                  bookmark.pinned ? (
                    <StarFilled className="h-4 w-4" />
                  ) : (
                    <Star className="h-4 w-4" />
                  )
                }
              />
              <IconAction
                label="Open link"
                onClick={handleOpen}
                disabled={selectMode || isEditing}
                icon={<ExternalLink className="h-4 w-4" />}
              />
              <IconAction
                label="Work on this in Focus"
                onClick={() => {
                  hapticTap();
                  handleWorkOnThis();
                }}
                disabled={selectMode || isEditing}
                icon={<Timer className="h-4 w-4" />}
              />
              <IconAction
                label={isEditing ? "Save" : "Edit"}
                onClick={() => {
                  hapticTap();
                  handleEditClick();
                }}
                icon={
                  isEditing ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )
                }
              />
              <IconAction
                label={isEditing ? "Cancel" : "Delete"}
                onClick={() => {
                  hapticTap();
                  if (isEditing) {
                    handleCancel();
                    return;
                  }
                  onDelete(bookmark.id);
                }}
                variant={isEditing ? "default" : "danger"}
                icon={
                  isEditing ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Trash className="h-4 w-4" />
                  )
                }
              />
            </div>
          )}
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
          <span>
            {new Date(bookmark.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
