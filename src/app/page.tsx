//src/app/page.tsx
"use client";

import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bookmark } from "@/types/bookmark";
import { BookmarkCard } from "@/components/BookmarkCard";
import { parseBookmarkHtml } from "@/utils/parseBookmarkHtml";
import { bookmarksToNetscapeHtml } from "@/utils/bookmarksToHtml";
import { DragonCursor } from "@/components/DragonCursor";

export default function HomePage() {
  const router = useRouter();
  const {
    bookmarks,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    restoreFromSnapshot,
  } = useBookmarks();

  const [search, setSearch] = useState("");
  // Default to "favorites" so only pinned bookmarks show initially
  const [folderFilter, setFolderFilter] = useState<string>("favorites");

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newFolder, setNewFolder] = useState(""); // NEW: folder to add to
  const [newTags, setNewTags] = useState(""); // NEW
  const [showAddForm, setShowAddForm] = useState(false);
  const [undoState, setUndoState] = useState<{
    type: "delete" | "clearAll";
    snapshot: Bookmark[];
  } | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const handleLogout = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("bookmarkdeck:v1");
    document.cookie = "bookmarkdeck_auth=true; path=/; max-age=0";
    router.push("/login");
  };

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

  const handleDismissUndo = () => {
    setUndoState(null);
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
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

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* Dragon cursor layer (behind everything) */}
      <DragonCursor />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Bookmark Deck logo"
                width={56}
                height={56}
                className="h-14 w-14 rounded-md object-cover"
                priority
              />
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Bookmark Deck
              </h1>
            </div>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              All your frequently used sites in one place — fast, simple, and
              private.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
            >
              <span className="text-lg">＋</span>
              Add quick link
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
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-xs font-medium text-slate-100 shadow-sm hover:bg-slate-700">
                <span className="text-lg">📥</span>
                Import bookmarks
              </span>
            </label>

            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-white"
            >
              <span className="text-lg">📤</span>
              Export
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-900/40 ring-1 ring-white/10 transition hover:from-blue-400 hover:to-blue-600 hover:shadow-blue-800/50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5 text-white"
                aria-hidden="true"
              >
                <path d="M11 3a1 1 0 0 1 2 0v8a1 1 0 0 1-2 0zm-1.707 2.293a1 1 0 0 1 1.414 1.414 6 6 0 1 0 4.586 0 1 1 0 0 1 1.414-1.414 8 8 0 1 1-7.414 0" />
              </svg>
            </button>
          </div>
        </header>

        {/* Add quick link */}
        {showAddForm && (
          <section className="mb-6 rounded-2xl bg-slate-900/60 p-4 shadow-inner ring-1 ring-white/5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-200">
                Add quick link
              </h2>
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
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="url"
                placeholder="https://example.com"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                placeholder="Add to folder (e.g. Banking, Work)"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:max-w-xs"
              />
              <input
                type="text"
                placeholder="Tags (comma separated, e.g. work, dev, banking)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                className="w-full h-10 rounded-2xl border border-slate-800 bg-slate-900/80 py-2 pl-9 pr-9 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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

        {/* Grid of cards */}
        {filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No bookmarks yet.{" "}
            <span className="font-medium text-slate-200">
              Add{" "}
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
              </button>{" "}
              or{" "}
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
                  📥 Import Bookmarks
                </span>
              </label>
            </span>
          </div>
        ) : (
          <section
            aria-label="Bookmarks"
            className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
          >
            {filtered.map((b) => (
              <BookmarkCard
                key={b.id}
                bookmark={b}
                onUpdate={updateBookmark}
                onDelete={handleDelete}
              />
            ))}
          </section>
        )}
        {/* Undo bar */}
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
