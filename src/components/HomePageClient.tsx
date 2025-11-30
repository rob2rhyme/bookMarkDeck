"use client";

import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

import { BookmarkCard } from "@/components/BookmarkCard";
import { DragonCursor } from "@/components/DragonCursor";
import { ShortcutCard } from "@/components/ShortcutCard";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useShortcuts } from "@/hooks/useShortcuts";
import { Bookmark } from "@/types/bookmark";
import { ShortcutApp } from "@/types/shortcut";
import { bookmarksToNetscapeHtml } from "@/utils/bookmarksToHtml";
import { parseBookmarkHtml } from "@/utils/parseBookmarkHtml";
import type { FirestoreBookmarkBackup } from "@/utils/firestoreBookmarks";

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
      return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
        host
      )}`;
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

export function HomePageClient() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const {
    bookmarks,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    restoreFromSnapshot,
    syncFromCloud,
    syncToCloud,
    isSyncing,
    syncError,
    lastSyncedAt,
    refreshBackups,
    backups,
    areBackupsLoading,
    backupError,
  } = useBookmarks(userId);

  const [search, setSearch] = useState("");
  // Default to "favorites" so only pinned bookmarks show initially
  // Start with all bookmarks so imports are visible immediately
  const [folderFilter, setFolderFilter] = useState<string>("");

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newFolder, setNewFolder] = useState(""); // NEW: folder to add to
  const [newTags, setNewTags] = useState(""); // NEW
  const [showAddForm, setShowAddForm] = useState(false);
const [showAddShortcutForm, setShowAddShortcutForm] = useState(false);
const [shortcutName, setShortcutName] = useState("");
const [shortcutUrl, setShortcutUrl] = useState("");
const [shortcutIcon, setShortcutIcon] = useState("");
const [shortcutIconTouched, setShortcutIconTouched] = useState(false);
const [editingShortcut, setEditingShortcut] = useState<ShortcutApp | null>(null);
const [editName, setEditName] = useState("");
const [editUrl, setEditUrl] = useState("");
const [editIcon, setEditIcon] = useState("");
const [editIconTouched, setEditIconTouched] = useState(false);
  const [undoState, setUndoState] = useState<{
    type: "delete" | "clearAll";
    snapshot: Bookmark[];
  } | null>(null);
const [shortcutUndoState, setShortcutUndoState] = useState<{
  snapshot: ShortcutApp[];
} | null>(null);
const [showScrollTop, setShowScrollTop] = useState(false);
const [showClearConfirm, setShowClearConfirm] = useState(false);
const [showBackups, setShowBackups] = useState(false);
  const handleLogout = () => signOut({ callbackUrl: "/login" });

  const folders = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((b) => b.folder && set.add(b.folder));
    return Array.from(set);
  }, [bookmarks]);

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window === "undefined") return;
      setShowScrollTop(window.scrollY > 240);
    };

    handleScroll(); // initialize on mount
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (shortcutIconTouched) return;
    if (!shortcutUrl.trim()) {
      setShortcutIcon("");
      return;
    }
    const favicon = getFaviconUrl(shortcutUrl);
    setShortcutIcon(favicon);
  }, [shortcutUrl, shortcutIconTouched]);

  useEffect(() => {
    if (!editingShortcut) return;
    if (editIconTouched) return;
    if (editIcon.trim()) return;
    const favicon = getFaviconUrl(editUrl);
    if (favicon) {
      setEditIcon(favicon);
    }
  }, [editUrl, editIcon, editIconTouched, editingShortcut]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (
      bookmarks
        .filter((b) => {
          const tags = b.tags ?? [];

          const matchesSearch =
            !q ||
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            (b.note ?? "").toLowerCase().includes(q) ||
            (b.folder ?? "").toLowerCase().includes(q) ||
            tags.some((t) => t.toLowerCase().includes(q)); // search tags

          // Folder filter logic
          let matchesFolder = true;
          if (folderFilter === "favorites") {
            // show only pinned / favorited bookmarks
            matchesFolder = !!b.pinned;
          } else if (folderFilter === "with-notes") {
            matchesFolder = !!b.note && b.note.trim().length > 0;
          } else if (folderFilter) {
            // any specific folder name
            matchesFolder = b.folder === folderFilter;
          }

          return matchesSearch && matchesFolder;
        })
        // NEW: surface pinned/favorite bookmarks at the top
        .sort((a, b) => {
          const aPinned = !!a.pinned;
          const bPinned = !!b.pinned;

          if (aPinned === bPinned) {
            // fall back to newest first
            return (
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          }
          return aPinned ? -1 : 1;
        })
    );
  }, [bookmarks, search, folderFilter]);

  const groupedByTag = useMemo(() => {
    const groups: Map<string, Bookmark[]> = new Map();
    filtered.forEach((b) => {
      const tags = b.tags && b.tags.length ? b.tags : ["Untagged"];
      tags.forEach((tag) => {
        const key = tag.trim() || "Untagged";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(b);
      });
    });
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [filtered]);

  const {
    shortcuts,
    addShortcut,
    updateShortcut,
    deleteShortcut,
    restoreFromSnapshot: restoreShortcuts,
    syncFromCloudShortcuts,
    syncToCloudShortcuts,
    isSyncing: isSyncingShortcuts,
  } = useShortcuts(userId);

  const trending = useMemo(() => {
    const scored = filtered.map((b) => {
      const hits = b.hits ?? 0;
      const lastUsed = b.lastUsedAt
        ? new Date(b.lastUsedAt).getTime()
        : new Date(b.createdAt).getTime();
      // weight hits heavily, then pin status, then recency
      const score = hits * 10 + (b.pinned ? 5 : 0) + lastUsed / 1_000_000;
      return { ...b, score };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return top;
  }, [filtered]);

  const TrendingBookmarkCard = ({
    bookmark,
    usageLabel,
  }: {
    bookmark: Bookmark;
    usageLabel?: string;
  }) => {
    const favicon = getFaviconUrl(bookmark.url);
    const initial = firstLetterFromUrlOrTitle(bookmark.url, bookmark.title);
    const hostname = getHostname(bookmark.url);
    const [faviconFailed, setFaviconFailed] = useState(false);

    useEffect(() => {
      setFaviconFailed(false);
    }, [bookmark.url]);

    const handleOpen = () => {
      const target = bookmark.url.trim();
      if (!target) return;
      window.open(target, "_blank", "noopener,noreferrer");
    };

    const togglePinned = () => {
      updateBookmark(bookmark.id, { pinned: !bookmark.pinned });
    };

    return (
      <div className="group relative flex h-full min-h-[92px] items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500/50 hover:bg-slate-900">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-12 w-12 min-w-[48px] items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-xl text-white ring-1 ring-white/5">
            {favicon && !faviconFailed ? (
              <img
                src={favicon}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
                loading="lazy"
                onError={() => setFaviconFailed(true)}
              />
            ) : (
              <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-100">
                {initial}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-semibold leading-tight text-slate-100">
                {bookmark.title || hostname}
              </span>
              {usageLabel && (
                <span className="rounded-full border border-slate-700/80 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  {usageLabel}
                </span>
              )}
            </div>
            <span className="truncate text-[12px] text-slate-400">{hostname}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpen}
            className="shrink-0 whitespace-nowrap rounded-full bg-blue-600/90 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition group-hover:bg-blue-500"
          >
            Open
          </button>
          <button
            type="button"
            onClick={togglePinned}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-200 transition hover:border-blue-400 hover:text-white"
            aria-label={bookmark.pinned ? "Unfavorite" : "Favorite"}
          >
            {bookmark.pinned ? "★" : "☆"}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(bookmark.id)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-300 transition hover:border-red-400 hover:bg-red-900/60 hover:text-white"
            aria-label={`Delete ${bookmark.title || hostname}`}
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  const usageLabelFor = (hits?: number) => {
    const h = hits ?? 0;
    if (h >= 15) return "#Highly Used";
    if (h >= 6) return "#Medium Used";
    if (h >= 1) return "#Lightly Used";
    return "#New";
  };

  const handleAddQuick = () => {
    if (!newUrl.trim()) return;

    const folderName = newFolder.trim() || undefined;
    const tags = newTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    addBookmark({
      title: newTitle.trim() || newUrl.trim(),
      url: newUrl.trim(),
      note: "",
      folder: folderName,
      tags,
    });

    setNewTitle("");
    setNewUrl("");
    setNewFolder("");
    setNewTags("");
    setShowAddForm(false);
  };

  const handleAddShortcut = () => {
    if (!shortcutName.trim() || !shortcutUrl.trim()) return;
    const autoIcon = getFaviconUrl(shortcutUrl.trim());
    const icon = shortcutIconTouched ? shortcutIcon.trim() : autoIcon;
    addShortcut({
      name: shortcutName.trim(),
      url: shortcutUrl.trim(),
      icon: icon || undefined,
    });
    setShortcutName("");
    setShortcutUrl("");
    setShortcutIcon("");
    setShortcutIconTouched(false);
    setShowAddShortcutForm(false);
  };

  const handleDelete = (id: string) => {
    if (bookmarks.length === 0) return;
    // snapshot BEFORE delete
    setUndoState({ type: "delete", snapshot: bookmarks });
    deleteBookmark(id);
  };

  const handleClearAll = () => {
    if (bookmarks.length === 0) return;
    setUndoState({ type: "clearAll", snapshot: bookmarks });
    clearAll();
  };

  const handleUndo = () => {
    if (!undoState) return;
    restoreFromSnapshot(undoState.snapshot);
    setUndoState(null);
  };

  const handleShortcutDelete = (id: string) => {
    if (shortcuts.length === 0) return;
    setShortcutUndoState({ snapshot: shortcuts });
    deleteShortcut(id);
  };

  const handleShortcutUpdate = (id: string, data: Partial<ShortcutApp>) => {
    updateShortcut(id, data);
  };

  const handleStartShortcutEdit = (app: ShortcutApp) => {
    setEditingShortcut(app);
    setEditName(app.name);
    setEditUrl(app.url);
    setEditIcon(app.icon ?? "");
    setEditIconTouched(false);
  };

  const handleSaveShortcutEdit = () => {
    if (!editingShortcut) return;
    if (!editName.trim() || !editUrl.trim()) return;
    const autoIcon = getFaviconUrl(editUrl.trim());
    const icon = editIconTouched ? editIcon.trim() : autoIcon;
    handleShortcutUpdate(editingShortcut.id, {
      name: editName.trim(),
      url: editUrl.trim(),
      icon: icon || undefined,
    });
    setEditingShortcut(null);
  };

  const handleCancelShortcutEdit = () => {
    setEditingShortcut(null);
    setEditIconTouched(false);
  };

  const handleShortcutUndo = () => {
    if (!shortcutUndoState) return;
    restoreShortcuts(shortcutUndoState.snapshot);
    setShortcutUndoState(null);
  };

  const handleDismissUndo = () => {
    setUndoState(null);
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();

    // Attempt JSON first (supports cross-account backups with shortcuts).
    const isLikelyJson =
      file.name.toLowerCase().endsWith(".json") || text.trim().startsWith("{");
    if (isLikelyJson) {
      try {
        const parsed = JSON.parse(text);
        const importedBookmarks: Bookmark[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.bookmarks)
            ? parsed.bookmarks
            : [];
        const importedShortcuts: ShortcutApp[] = Array.isArray(parsed.shortcuts)
          ? parsed.shortcuts
          : [];

        // Merge bookmarks by URL
        if (importedBookmarks.length > 0) {
          const existingByUrl = new Map(bookmarks.map((b) => [b.url, b]));
          const merged: Bookmark[] = [...bookmarks];
          importedBookmarks.forEach((imp) => {
            if (!existingByUrl.has(imp.url)) {
              merged.push(imp);
            }
          });
          clearAll();
          merged.forEach((b) =>
            addBookmark({
              title: b.title,
              url: b.url,
              note: b.note,
              folder: b.folder,
              tags: b.tags ?? [],
            })
          );
        }

        // Merge shortcuts by URL
        if (importedShortcuts.length > 0) {
          const existingByUrl = new Map(shortcuts.map((s) => [s.url, s]));
          const mergedShortcuts: ShortcutApp[] = [...shortcuts];
          importedShortcuts.forEach((imp) => {
            if (!existingByUrl.has(imp.url)) {
              mergedShortcuts.push(imp);
            }
          });
          restoreShortcuts(mergedShortcuts);
        }

        // If JSON was parsed successfully, stop here.
        return;
      } catch (err) {
        console.error("JSON import failed, trying HTML instead", err);
      }
    }

    // Fallback to Netscape HTML import (bookmarks only)
    const imported = parseBookmarkHtml(text);

    // Merge, de-dupe by URL
    const existingByUrl = new Map(bookmarks.map((b) => [b.url, b]));
    const merged: Bookmark[] = [...bookmarks];

    imported.forEach((imp) => {
      if (!existingByUrl.has(imp.url)) {
        merged.push(imp);
      }
    });

    // reset and re-add (keeps normalization from hook)
    clearAll();
    merged.forEach((b) =>
      addBookmark({
        title: b.title,
        url: b.url,
        note: b.note,
        folder: b.folder,
        tags: b.tags ?? [],
      })
    );
  };

  const handleExport = () => {
    if (bookmarks.length === 0) return;

    const html = bookmarksToNetscapeHtml(bookmarks);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmarkdeck-export.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackupDownload = (backup: FirestoreBookmarkBackup) => {
    if (!backup.bookmarks.length && !(backup.shortcuts?.length)) return;
    const createdStamp = (() => {
      const date = new Date(backup.createdAt);
      if (Number.isNaN(date.getTime())) return backup.id;
      return date.toISOString().replace(/[:.]/g, "-");
    })();

    // Export full-fidelity JSON so bookmarks + shortcuts roundtrip across accounts.
    const payload = {
      createdAt: backup.createdAt,
      bookmarks: backup.bookmarks,
      shortcuts: backup.shortcuts ?? [],
      type: "bookmarkdeck-backup",
      version: 1,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookmarkdeck-backup-${createdStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBackupDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const handleRefreshBackups = async () => {
    if (!userId) return;
    await refreshBackups(userId);
  };

  const handleSyncDownload = async () => {
    if (isSyncing || isSyncingShortcuts) return;
    await syncFromCloud(userId);
    await syncFromCloudShortcuts(userId);
    await handleRefreshBackups();
  };

  const handleSyncUpload = async () => {
    if (isSyncing || isSyncingShortcuts) return;
    await syncToCloud(userId, shortcuts);
    await syncToCloudShortcuts(userId);
    await handleRefreshBackups();
  };

  const avatarSrc = session?.user?.image ?? null;
  const avatarLabel =
    session?.user?.name ?? session?.user?.email ?? "Account";

  return (
    <main className="relative flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* Dragon cursor layer (behind everything) */}
      <DragonCursor />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:mb-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <Image
                  src="/logo.png"
                  alt="Bookmark Deck logo"
                  width={56}
                  height={56}
                  className="h-11 w-11 rounded-md object-cover sm:h-14 sm:w-14"
                  priority
                />
                <h1 className="text-xl font-semibold tracking-tight sm:text-4xl">
                  Bookmark Deck
                </h1>
              </div>
              {session && (
                <div className="flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/70 px-2 py-1 shadow-sm sm:gap-3 sm:px-3 sm:py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-[11px] font-semibold text-slate-100 ring-1 ring-white/5 sm:h-9 sm:w-9 sm:text-sm">
                    {avatarSrc ? (
                      <Image
                        src={avatarSrc}
                        alt={avatarLabel}
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{avatarLabel.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="max-w-[100px] truncate text-[10px] font-medium text-slate-200 sm:max-w-[180px] sm:text-xs">
                    {avatarLabel}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              All your frequently used sites in one place — fast, simple, and
              private.
            </p>
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:gap-2.5 sm:justify-end sm:overflow-visible">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-blue-600 px-2.5 text-[10px] font-semibold text-white shadow-sm hover:bg-blue-500 sm:h-10 sm:px-4 sm:text-xs"
            >
              <span className="text-lg">＋</span>
              Add Link
            </button>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="file"
                accept=".html,text/html"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) =>
                  handleImport(e.target.files?.[0] ?? null).catch(console.error)
                }
              />
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-800 px-2.5 text-[10px] font-medium text-slate-100 shadow-sm hover:bg-slate-700 sm:h-10 sm:px-4 sm:text-xs">
                <span className="text-base">📥</span>
                Import
              </span>
            </label>

            <button
              onClick={handleExport}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[10px] font-semibold text-slate-900 shadow-sm hover:bg-white sm:h-10 sm:px-4 sm:text-xs"
            >
              <span className="text-base">📤</span>
              Export
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-2.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:h-10 sm:px-4 sm:text-xs"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-white/15 shadow-inner shadow-black/30 sm:h-7 sm:w-7">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    d="M12 3v8M8.5 6.5a6 6 0 1 0 7 0"
                  />
                </svg>
              </span>
              <span className="text-[11px] font-semibold tracking-wide text-white">
                LOGOUT
              </span>
            </button>
          </div>
        </header>

        {/* Add quick link */}
        {showAddForm && (
          <section className="mb-6 rounded-2xl bg-slate-900/60 p-4 shadow-inner ring-1 ring-white/5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-200">Add link</h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="Title (optional)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="url"
                placeholder="https://example.com"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                placeholder="Add to folder (e.g. Banking, Work)"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:max-w-xs"
              />
              <input
                type="text"
                placeholder="Tags (comma separated, e.g. work, dev, banking)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleAddQuick}
                className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
              >
                Save
              </button>
            </div>
          </section>
        )}

        {/* App shortcuts */}
        <section className="mb-6 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
              App shortcuts
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Open common tools fast</span>
              <button
                type="button"
                onClick={() =>
                  setShowAddShortcutForm((v) => {
                    const next = !v;
                    if (next) {
                      setShortcutIconTouched(false);
                      if (!shortcutIcon.trim() && shortcutUrl.trim()) {
                        setShortcutIcon(getFaviconUrl(shortcutUrl));
                      }
                    }
                    return next;
                  })
                }
                className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                {showAddShortcutForm ? "Close" : "Add shortcut"}
              </button>
            </div>
          </div>
          {showAddShortcutForm && (
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-3 sm:items-center">
              <input
                type="text"
                placeholder="App name"
                value={shortcutName}
                onChange={(e) => setShortcutName(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="url"
                placeholder="https://app.example.com"
                value={shortcutUrl}
                onChange={(e) => setShortcutUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddShortcut}
                className="h-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Save shortcut
              </button>
            </div>
          )}
          {shortcuts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
              No shortcuts yet. Add one to jump into your favorite apps faster.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 min-[906px]:grid-cols-2">
              {shortcuts.map((app) => (
                <ShortcutCard
                  key={app.id}
                  app={app}
                  onDelete={handleShortcutDelete}
                  onEdit={handleStartShortcutEdit}
                />
              ))}
            </div>
          )}
        </section>

        {/* Trending */}
        {trending.length > 0 && (
          <section className="mb-6 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Trending
              </h2>
              <span className="text-xs text-slate-500">
                Most opened bookmarks (per device/account)
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[902px]:grid-cols-2 sm:gap-4">
              {trending.map((b) => (
                <TrendingBookmarkCard
                  key={`trending-${b.id}`}
                  bookmark={b}
                  usageLabel={usageLabelFor(b.hits)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Search + filters */}
        <section className="mb-6 flex flex-col gap-3">
          <div className="w-full">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by title, URL, note, folder, or tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 rounded-2xl border border-slate-800 bg-slate-900/80 py-2 pl-9 pr-9 text-base text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute inset-y-0 right-2 flex items-center justify-center rounded-full px-2 text-slate-500 transition hover:bg-slate-800/70 hover:text-slate-100"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-xs sm:flex-nowrap">
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="h-10 flex-1 min-w-0 rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 lg:w-1/2 lg:flex-none"
            >
              <option value="">All bookmarks</option>
              <option value="favorites">Favorites only</option>
              <option value="with-notes">Only with notes</option>
              {folders
                .filter((f) => f.trim().length > 0)
                .map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFolderFilter("");
              }}
              className="h-10 flex-1 min-w-0 rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 text-center outline-none transition hover:border-blue-500 hover:bg-slate-800 hover:text-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 lg:w-1/4 lg:flex-none"
            >
              Clear search & filters
            </button>

            {bookmarks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="h-10 flex-1 min-w-0 rounded-full border border-red-700/60 bg-red-900/40 px-3 py-2 text-xs font-semibold text-red-200 text-center hover:bg-red-900/80 lg:flex-1"
              >
                Delete All Bookmarks
              </button>
            )}
          </div>
        </section>

        {/* Cloud sync (Firebase) */}
        <section className="mb-6 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                Cloud sync (signed in as {userId ?? "guest"})
              </p>
              <p className="text-[12px] text-slate-500">
                Sync bookmarks to Firebase so they follow your Google login across devices.
              </p>
              {syncError && (
                <p className="text-[11px] text-red-400">{syncError}</p>
              )}
              {lastSyncedAt && (
                <p className="text-[11px] text-emerald-300">
                  Last synced: {new Date(lastSyncedAt).toLocaleString()}
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                We keep the last 7 sync snapshots (bookmarks + app shortcuts) and make each downloadable as JSON for cross-account restores.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-56">
              <button
                type="button"
                onClick={handleSyncDownload}
                disabled={isSyncing || isSyncingShortcuts || !userId}
                className="w-full rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncing || isSyncingShortcuts ? "Syncing..." : "Sync from cloud"}
              </button>
              <button
                type="button"
                onClick={handleSyncUpload}
                disabled={isSyncing || isSyncingShortcuts || !userId}
                className="w-full rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncing || isSyncingShortcuts ? "Syncing..." : "Sync to cloud"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !showBackups;
                  setShowBackups(next);
                  if (!next) return;
                  handleRefreshBackups().catch(console.error);
                }}
                disabled={!userId || areBackupsLoading}
                className="w-full rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {areBackupsLoading ? "Loading..." : showBackups ? "Hide backups" : "My Backups"}
              </button>
            </div>
          </div>
          {showBackups && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-800/70 bg-slate-900/70 p-3">
              {areBackupsLoading ? (
                <p className="text-xs text-slate-400">Loading backups…</p>
              ) : backupError ? (
                <p className="text-xs text-red-400">Backups unavailable: {backupError}</p>
              ) : backups.length === 0 ? (
                <p className="text-xs text-slate-400">No backups yet. Sync to cloud to create one.</p>
              ) : (
                backups.map((backup) => (
                  <div
                    key={backup.id}
                    className="flex flex-col gap-1 rounded-lg border border-slate-800/70 bg-slate-950/40 p-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-100">
                        {formatBackupDate(backup.createdAt)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {backup.bookmarks.length} bookmark{backup.bookmarks.length !== 1 ? "s" : ""} ·{" "}
                        {backup.shortcuts?.length ?? 0} shortcut{(backup.shortcuts?.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBackupDownload(backup)}
                      className="inline-flex items-center justify-center rounded-full bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-slate-700"
                    >
                      Download backup
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Grid of cards grouped by tag */}
        {filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <p className="text-base text-slate-200">No bookmarks yet.</p>
              <button
                type="button"
                onClick={handleSyncDownload}
                disabled={isSyncing || isSyncingShortcuts || !userId}
                className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100 shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>Sync from cloud</span>
                {(isSyncing || isSyncingShortcuts) && (
                  <span className="text-[10px] text-slate-400">...</span>
                )}
              </button>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    if (typeof window !== "undefined") {
                      window.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-600/90 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  Quick Link
                </button>
                <span className="text-slate-400">or</span>
                <label className="relative inline-flex cursor-pointer items-center align-middle">
                  <input
                    type="file"
                    accept=".html,text/html"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) =>
                      handleImport(e.target.files?.[0] ?? null).catch(
                        console.error
                      )
                    }
                  />
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 shadow-sm hover:bg-slate-700">
                    📥 Import
                  </span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByTag.map(([tag, items]) => (
              <section key={tag} aria-label={`Bookmarks tagged ${tag}`} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {tag}
                  </h3>
                  <span className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {items.map((b) => (
                    <BookmarkCard
                      key={`${tag}-${b.id}`}
                      bookmark={b}
                      onUpdate={updateBookmark}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {/* Shortcut edit modal */}
        {editingShortcut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                    Edit shortcut
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {editingShortcut.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelShortcutEdit}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="App name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="https:// or myapp://"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Emoji icon"
                  value={editIcon}
                  onChange={(e) => {
                    setEditIconTouched(true);
                    setEditIcon(e.target.value);
                  }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelShortcutEdit}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveShortcutEdit}
                  className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Undo bar */}
        {shortcutUndoState && (
          <div
            className={`fixed inset-x-0 ${
              undoState ? "bottom-16" : "bottom-4"
            } z-50 flex justify-center px-4`}
          >
            <div className="flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2 text-xs text-slate-100 shadow-lg ring-1 ring-slate-700">
              <span>Shortcut removed</span>
              <button
                onClick={handleShortcutUndo}
                className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-white"
              >
                Undo
              </button>
              <button
                onClick={() => setShortcutUndoState(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Dismiss undo"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {undoState && (
          <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
            <div className="flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2 text-xs text-slate-100 shadow-lg ring-1 ring-slate-700">
              <span>
                {undoState.type === "delete"
                  ? "Bookmark deleted"
                  : "All bookmarks cleared"}
              </span>
              <button
                onClick={handleUndo}
                className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-white"
              >
                Undo
              </button>
              <button
                onClick={handleDismissUndo}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Dismiss undo"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Confirm delete all modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl">
              <h2 className="mb-2 text-base font-semibold text-slate-50">
                Delete all bookmarks?
              </h2>
              <p className="mb-4 text-xs text-slate-400">
                This will remove every bookmark from this device. You can still
                use the Undo snackbar right after, but this action cannot be
                reversed later.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleClearAll();
                    setShowClearConfirm(false);
                  }}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
                >
                  Delete all
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-12 flex w-full flex-col items-center gap-2 text-sm text-slate-400">
          <div className="flex w-full max-w-5xl items-center gap-3 text-[11px] text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            <span className="shrink-0">Info</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>
          <div className="flex items-center gap-4">
            <Link className="hover:text-blue-300" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-blue-300" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-blue-300" href="/faq">
              FAQ
            </Link>
          </div>
          <div className="text-xs text-slate-500">
            © {new Date().getFullYear()} Bookmark Deck. All rights reserved.
          </div>
        </footer>

        {showScrollTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Scroll to top"
            className="
    fixed bottom-6 right-6 z-40
    flex items-center justify-center
    h-12 w-12
    rounded-full
    bg-white/5
    backdrop-blur-md
    border border-white/10
    shadow-lg shadow-black/30
    text-slate-200
    transition-all
    duration-300
    hover:scale-110
    hover:bg-white/10
    hover:border-blue-400/40
    hover:shadow-blue-500/20
  "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4l0 16M5 11l7-7 7 7"
              />
            </svg>
          </button>
        )}
      </div>
    </main>
  );
}

export default HomePageClient;
