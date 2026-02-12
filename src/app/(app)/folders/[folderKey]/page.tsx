"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { useSession } from "next-auth/react";

import { BookmarkCard } from "@/components/BookmarkCard";
import { ArrowLeft, X } from "@/components/icons";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Bookmark } from "@/types/bookmark";

function folderKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFolderName(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function FolderPage() {
  const params = useParams<{ folderKey: string }>();
  const paramKey = params?.folderKey ?? "";
  const decodedParam = safeDecode(paramKey);
  const routeKey = folderKey(decodedParam);

  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const { bookmarks, updateBookmark, deleteBookmark, restoreFromSnapshot } =
    useBookmarks(userId);

  const localFoldersKey = userId
    ? `bookmarkDeck.folders.local:${userId}`
    : "bookmarkDeck.folders.local:guest";

  const readLocalFolders = (key: string) => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const cleaned = parsed
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
      return Array.from(new Set(cleaned));
    } catch {
      return [];
    }
  };

  const [localFolders, setLocalFolders] = useState<string[]>(() =>
    readLocalFolders(localFoldersKey)
  );
  const [bookmarkSelectMode, setBookmarkSelectMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [showBulkMoveBookmarksModal, setShowBulkMoveBookmarksModal] =
    useState(false);
  const [bookmarkBulkTarget, setBookmarkBulkTarget] = useState("__unstaged__");
  const [showBulkDeleteBookmarksConfirm, setShowBulkDeleteBookmarksConfirm] =
    useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderRequestRef = useRef<((name: string) => void) | null>(null);
  const [undoState, setUndoState] = useState<{
    type: "delete" | "bulkDelete";
    snapshot: Bookmark[];
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(localFoldersKey, JSON.stringify(localFolders));
  }, [localFolders, localFoldersKey]);

  const bookmarkFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    bookmarks.forEach((bookmark) => {
      const normalized = normalizeFolderName(bookmark.folder ?? "");
      if (!normalized) return;
      const key = folderKey(normalized);
      if (!map.has(key)) {
        map.set(key, normalized);
      }
    });
    return map;
  }, [bookmarks]);

  const orderedFolderList = useMemo(() => {
    const mergedMap = new Map<string, string>(bookmarkFolderMap);
    localFolders.forEach((name) => {
      const normalized = normalizeFolderName(name);
      if (!normalized) return;
      const key = folderKey(normalized);
      if (!mergedMap.has(key)) {
        mergedMap.set(key, normalized);
      }
    });

    const folders = Array.from(bookmarkFolderMap.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const mergedFolders = Array.from(mergedMap.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const existingKeys = new Set(folders.map((name) => folderKey(name)));
    const localOnlyFolders = mergedFolders.filter(
      (name) => !existingKeys.has(folderKey(name))
    );
    return [...localOnlyFolders, ...folders];
  }, [bookmarkFolderMap, localFolders]);

  const displayLabel =
    orderedFolderList.find((name) => folderKey(name) === routeKey) ??
    (decodedParam || "Folder");

  const folderItems = useMemo(() => {
    if (!routeKey) return [];
    return bookmarks.filter((bookmark) => {
      const normalized = normalizeFolderName(bookmark.folder ?? "");
      if (!normalized) return false;
      return folderKey(normalized) === routeKey;
    });
  }, [bookmarks, routeKey]);

  const addLocalFolder = (name: string) => {
    const normalized = normalizeFolderName(name);
    if (!normalized) return null;
    const existing = orderedFolderList.find(
      (folderName) => folderKey(folderName) === folderKey(normalized)
    );
    if (!existing) {
      setLocalFolders((prev) => [...prev, normalized]);
    }
    return existing ?? normalized;
  };

  const openNewFolderModal = (onCreated?: (name: string) => void) => {
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
    setSelectedBookmarkIds(Array.from(new Set(folderItems.map((b) => b.id))));
  };

  const applyMoveToSelection = (targetFolder?: string) => {
    const target = targetFolder && targetFolder.trim() ? targetFolder.trim() : undefined;
    const ids = Array.from(new Set(selectedBookmarkIds));
    if (ids.length === 0) return;
    ids.forEach((id) => updateBookmark(id, { folder: target }));
    setShowBulkMoveBookmarksModal(false);
    clearSelectionAndExit();
  };

  const handleConfirmBulkMove = () => {
    if (selectedBookmarkIds.length === 0) return;
    if (bookmarkBulkTarget === "__new__") {
      setShowBulkMoveBookmarksModal(false);
      openNewFolderModal((name) => {
        const normalized = addLocalFolder(name);
        if (!normalized) return;
        applyMoveToSelection(normalized);
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
                {displayLabel}
              </h1>
              <p className="text-xs text-slate-400">
                {folderItems.length} bookmark{folderItems.length !== 1 ? "s" : ""}
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

        {folderItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No bookmarks in this folder yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {folderItems.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                folders={orderedFolderList}
                onUpdate={updateBookmark}
                onDelete={handleDelete}
                selectMode={bookmarkSelectMode}
                isSelected={selectedBookmarkIds.includes(bookmark.id)}
                onToggleSelect={toggleBookmarkSelection}
              />
            ))}
          </div>
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
                  {orderedFolderList.map((folderName) => (
                    <option key={folderName} value={folderName}>
                      {folderName}
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
                  const normalized = addLocalFolder(newFolderName);
                  if (!normalized) return;
                  newFolderRequestRef.current?.(normalized);
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
                    const normalized = addLocalFolder(newFolderName);
                    if (!normalized) return;
                    newFolderRequestRef.current?.(normalized);
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
              <button
                onClick={handleUndo}
                className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-white"
              >
                Undo
              </button>
              <button
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
