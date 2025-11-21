//src/app/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bookmark } from "@/types/bookmark";
import { BookmarkCard } from "@/components/BookmarkCard";
import { parseBookmarkHtml } from "@/utils/parseBookmarkHtml";
import { bookmarksToNetscapeHtml } from "@/utils/bookmarksToHtml";

export default function HomePage() {
  const {
    bookmarks,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    restoreFromSnapshot,
  } = useBookmarks();

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all"); // NEW

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTags, setNewTags] = useState(""); // NEW
  const [showAddForm, setShowAddForm] = useState(false);
  const [undoState, setUndoState] = useState<{
    type: "delete" | "clearAll";
    snapshot: Bookmark[];
  } | null>(null);

  const folders = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((b) => b.folder && set.add(b.folder));
    return Array.from(set);
  }, [bookmarks]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((b) => {
      (b.tags ?? []).forEach((t) => set.add(t));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookmarks.filter((b) => {
      const tags = b.tags ?? [];

      const matchesSearch =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.note ?? "").toLowerCase().includes(q) ||
        (b.folder ?? "").toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q)); // NEW: search tags

      const matchesFolder =
        folderFilter === "all" ||
        (folderFilter === "with-notes" && (b.note ?? "").trim().length > 0) ||
        b.folder === folderFilter;

      const matchesTag =
        tagFilter === "all" || (b.tags ?? []).includes(tagFilter);

      return matchesSearch && matchesFolder && matchesTag;
    });
  }, [bookmarks, search, folderFilter, tagFilter]);

  const handleAddQuick = () => {
    if (!newUrl.trim()) return;

    const tags = newTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    addBookmark({
      title: newTitle.trim() || newUrl.trim(),
      url: newUrl.trim(),
      note: "",
      folder: undefined,
      tags,
    });

    setNewTitle("");
    setNewUrl("");
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
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Bookmark Deck logo"
                className="h-15 w-15 rounded-md object-cover"
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
                placeholder="Tags (comma separated, e.g. work, dev, banking)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
        <section className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by title, URL, note, folder, or tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All folders</option>
              <option value="with-notes">Only with notes</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>

            {bookmarks.length > 0 && (
              <button
                onClick={handleClearAll}
                className="rounded-full border border-red-700/60 bg-red-900/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/80"
              >
                Clear all
              </button>
            )}
          </div>
        </section>

        {/* Grid of cards */}
        {filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No bookmarks yet.{" "}
            <span className="font-medium text-slate-200">
              Add one above or import from your browser.
            </span>
          </div>
        ) : (
          <section
            aria-label="Bookmarks"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
      </div>
    </main>
  );
}
