"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { BookmarkCard } from "@/components/BookmarkCard";
import { ArrowLeft, Search, X } from "@/components/icons";
import { useBookmarks, normalizeFolderName } from "@/hooks/useBookmarks";
import { useBookmarkView, bookmarkGridClass } from "@/hooks/useBookmarkView";
import { Bookmark } from "@/types/bookmark";
import { makeFolderOptions } from "@/utils/folderOptions";

export default function UnstagedFolderPage() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const {
    bookmarks,
    folders,
    addFolder,
    updateBookmark,
    deleteBookmark,
    restoreFromSnapshot,
  } = useBookmarks(userId);

  const [bookmarkSelectMode, setBookmarkSelectMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [showBulkMoveBookmarksModal, setShowBulkMoveBookmarksModal] =
    useState(false);
  const [bookmarkBulkTarget, setBookmarkBulkTarget] = useState("__unstaged__");
  const [showBulkDeleteBookmarksConfirm, setShowBulkDeleteBookmarksConfirm] =
    useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderRequestRef = useRef<((folderId: string) => void) | null>(null);
  const [undoState, setUndoState] = useState<{
    type: "delete" | "bulkDelete";
    snapshot: Bookmark[];
  } | null>(null);
  const [bookmarkQuery, setBookmarkQuery] = useState("");
  const { view: bookmarkView, setView: setBookmarkView } = useBookmarkView();

  const folderOptions = useMemo(() => {
    return makeFolderOptions(folders);
  }, [folders]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );

  const unstagedItems = useMemo(() => {
    return bookmarks.filter(
      (bookmark) =>
        bookmark.folderId === null ||
        (bookmark.folderId === undefined && !normalizeFolderName(bookmark.folder ?? ""))
    );
  }, [bookmarks]);

  const filteredItems = useMemo(() => {
    const q = bookmarkQuery.trim().toLowerCase();
    if (!q) return unstagedItems;
    return unstagedItems.filter((bookmark) => {
      const hay = `${bookmark.title} ${bookmark.url} ${bookmark.note ?? ""} ${
        (bookmark.tags ?? []).join(" ")
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [unstagedItems, bookmarkQuery]);

  const addFolderOption = (name: string) => {
    const normalized = normalizeFolderName(name);
    if (!normalized) return null;
    const created = addFolder({ name: normalized, parentId: null });
    return created?.id ?? null;
  };

  const openNewFolderModal = (onCreated?: (folderId: string) => void) => {
    newFolderRequestRef.current = onCreated ?? null;
    setNewFolderName("");
    setShowNewFolderModal(true);
  };

  const clearSelectionAndExit = () => {
    setSelectedBookmarkIds([]);
    setBookmarkSelectMode(false);
  };

  const toggleBookmarkSelection = (id: string) => {
    setSelectedBookmarkIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const selectAllBookmarks = () => {
    setSelectedBookmarkIds(Array.from(new Set(filteredItems.map((item) => item.id))));
  };

  const applyMoveToSelection = (targetFolderId?: string) => {
    const target = targetFolderId && targetFolderId.trim() ? targetFolderId.trim() : null;
    const targetName = target ? folderById.get(target)?.name : undefined;
    const ids = Array.from(new Set(selectedBookmarkIds));
    if (ids.length === 0) return;

    ids.forEach((id) =>
      updateBookmark(id, {
        folderId: target,
        folder: targetName,
      })
    );

    setShowBulkMoveBookmarksModal(false);
    clearSelectionAndExit();
  };

  const handleConfirmBulkMove = () => {
    if (selectedBookmarkIds.length === 0) return;
    if (bookmarkBulkTarget === "__new__") {
      setShowBulkMoveBookmarksModal(false);
      openNewFolderModal((folderId) => {
        applyMoveToSelection(folderId);
      });
      return;
    }
    if (bookmarkBulkTarget === "__unstaged__") {
      applyMoveToSelection(undefined);
      return;
    }
    applyMoveToSelection(bookmarkBulkTarget);
  };

  const handleDelete = (id: string) => {
    setUndoState({ type: "delete", snapshot: bookmarks });
    deleteBookmark(id);
  };

  const handleConfirmBulkDelete = () => {
    if (selectedBookmarkIds.length === 0) return;
    setUndoState({ type: "bulkDelete", snapshot: bookmarks });
    selectedBookmarkIds.forEach((id) => deleteBookmark(id));
    setShowBulkDeleteBookmarksConfirm(false);
    clearSelectionAndExit();
  };

  const handleUndo = () => {
    if (!undoState) return;
    restoreFromSnapshot(undoState.snapshot);
    setUndoState(null);
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/5 transition hover:border-blue-400 hover:text-white active:scale-[0.98]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              Unstaged
            </h1>
            <p className="text-xs text-slate-400">
              {unstagedItems.length} bookmark
              {unstagedItems.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (bookmarkSelectMode) {
              clearSelectionAndExit();
              return;
            }
            setBookmarkSelectMode(true);
            setSelectedBookmarkIds([]);
          }}
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-white"
        >
          {bookmarkSelectMode ? "Done" : "Select"}
        </button>
      </header>

      {bookmarkSelectMode && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3">
          <span className="text-xs text-slate-300">
            {selectedBookmarkIds.length} bookmark
            {selectedBookmarkIds.length !== 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={() => {
              if (selectedBookmarkIds.length === 0) return;
              setBookmarkBulkTarget("__unstaged__");
              setShowBulkMoveBookmarksModal(true);
            }}
            disabled={selectedBookmarkIds.length === 0}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedBookmarkIds.length === 0) return;
              setShowBulkDeleteBookmarksConfirm(true);
            }}
            disabled={selectedBookmarkIds.length === 0}
            className="rounded-full border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={selectAllBookmarks}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelectedBookmarkIds([])}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={clearSelectionAndExit}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
          >
            Cancel
          </button>
        </div>
      )}

      {unstagedItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
          No bookmarks in Unstaged.
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={bookmarkQuery}
              onChange={(e) => setBookmarkQuery(e.target.value)}
              placeholder={`Search ${unstagedItems.length} unstaged bookmark${
                unstagedItems.length !== 1 ? "s" : ""
              }…`}
              aria-label="Search unstaged bookmarks"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {bookmarkQuery && (
              <button
                type="button"
                onClick={() => setBookmarkQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
            <div className="inline-flex shrink-0 rounded-xl border border-slate-800 bg-slate-900 p-0.5">
              {(
                [
                  ["comfortable", "Comfort"],
                  ["compact", "Compact"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={bookmarkView === v}
                  onClick={() => setBookmarkView(v)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    bookmarkView === v
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
              No bookmarks match “{bookmarkQuery.trim()}”.
            </div>
          ) : (
            <div className={bookmarkGridClass(bookmarkView)}>
              {filteredItems.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  query={bookmarkQuery}
                  folderOptions={folderOptions}
                  onUpdate={updateBookmark}
                  onDelete={handleDelete}
                  onRequestNewFolder={(onCreated) => {
                    openNewFolderModal((folderId) => {
                      onCreated(folderId);
                    });
                  }}
                  selectMode={bookmarkSelectMode}
                  isSelected={selectedBookmarkIds.includes(bookmark.id)}
                  onToggleSelect={toggleBookmarkSelection}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showBulkMoveBookmarksModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowBulkMoveBookmarksModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Move bookmarks"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Move bookmarks</h3>
              <button
                type="button"
                onClick={() => setShowBulkMoveBookmarksModal(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Move {selectedBookmarkIds.length} selected bookmark
                {selectedBookmarkIds.length !== 1 ? "s" : ""} to:
              </p>
              <select
                value={bookmarkBulkTarget}
                onChange={(e) => setBookmarkBulkTarget(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="__unstaged__">Unstaged</option>
                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label ?? option.name}
                  </option>
                ))}
                <option value="__new__">New folder…</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkMoveBookmarksModal(false)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkMove}
                disabled={selectedBookmarkIds.length === 0}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteBookmarksConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowBulkDeleteBookmarksConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Delete bookmarks"
          >
            <h2 className="mb-2 text-base font-semibold text-slate-50">
              Delete {selectedBookmarkIds.length} bookmarks?
            </h2>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteBookmarksConfirm(false)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowNewFolderModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="New folder"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">New folder</h3>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const folderId = addFolderOption(newFolderName);
                if (!folderId) return;
                newFolderRequestRef.current?.(folderId);
                setShowNewFolderModal(false);
              }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const folderId = addFolderOption(newFolderName);
                  if (!folderId) return;
                  newFolderRequestRef.current?.(folderId);
                  setShowNewFolderModal(false);
                }}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {undoState && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2 text-xs text-slate-100 shadow-lg ring-1 ring-slate-700">
            <span>
              {undoState.type === "bulkDelete"
                ? "Bookmarks deleted"
                : "Bookmark deleted"}
            </span>
            <button type="button"
              onClick={handleUndo}
              className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-white"
            >
              Undo
            </button>
            <button type="button"
              onClick={() => setUndoState(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-transform duration-150 ease-out hover:bg-slate-800/60 hover:text-slate-100 active:scale-95"
              aria-label="Dismiss undo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
