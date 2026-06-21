//src/app/(app)/folders/[folderKey]/page.tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { useSession } from "next-auth/react";

import { BookmarkCard } from "@/components/BookmarkCard";
import { FolderCard } from "@/components/FolderCard";
import { IconAction } from "@/components/IconAction";
import {
  ArrowLeft,
  CheckSquare,
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from "@/components/icons";
import { useBookmarks, normalizeFolderName } from "@/hooks/useBookmarks";
import { Bookmark } from "@/types/bookmark";
import { Folder } from "@/types/folder";
import { makeFolderOptions } from "@/utils/folderOptions";

function folderNameKey(value: string) {
  return value.trim().toLowerCase();
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sortFolders(items: Folder[]): Folder[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function buildBreadcrumbPath(folder: Folder, folderById: Map<string, Folder>): Folder[] {
  const path: Folder[] = [];
  const visited = new Set<string>();
  let cursor: Folder | undefined = folder;

  while (cursor) {
    if (visited.has(cursor.id)) break;
    visited.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
  }

  return path.reverse();
}

export default function FolderPage() {
  const params = useParams<{ folderKey: string }>();
  const router = useRouter();
  const paramKey = params?.folderKey ?? "";
  const decodedParam = safeDecode(paramKey);

  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const {
    bookmarks,
    folders,
    updateBookmark,
    deleteBookmark,
    restoreFromSnapshot,
    addFolder,
    updateFolder,
    deleteFolder,
  } = useBookmarks(userId);

  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const directMatch = folderById.get(decodedParam);
  const legacyMatch = useMemo(() => {
    if (directMatch || !decodedParam) return null;
    const legacyKey = folderNameKey(decodedParam);
    return (
      folders.find(
        (folder) =>
          folder.parentId === null && folderNameKey(folder.name) === legacyKey
      ) ?? null
    );
  }, [decodedParam, directMatch, folders]);

  const currentFolder = directMatch ?? legacyMatch;
  const currentFolderId = currentFolder?.id ?? null;

  useEffect(() => {
    if (!legacyMatch || directMatch) return;
    router.replace(`/folders/${encodeURIComponent(legacyMatch.id)}`);
  }, [legacyMatch, directMatch, router]);

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
  const [showNewSubfolderModal, setShowNewSubfolderModal] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [newSubfolderError, setNewSubfolderError] = useState("");
  const [showRenameFolderModal, setShowRenameFolderModal] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameFolderError, setRenameFolderError] = useState("");
  const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState(false);
  const [folderActionError, setFolderActionError] = useState("");
  const [undoState, setUndoState] = useState<{
    type: "delete" | "bulkDelete";
    snapshot: Bookmark[];
  } | null>(null);

  const breadcrumbs = useMemo(() => {
    if (!currentFolder) return [];
    return buildBreadcrumbPath(currentFolder, folderById);
  }, [currentFolder, folderById]);
  const currentPathLabel = useMemo(() => {
    const fromBreadcrumbs = breadcrumbs.map((segment) => segment.name).join(" / ");
    if (fromBreadcrumbs) return fromBreadcrumbs;
    return currentFolder?.name ?? "";
  }, [breadcrumbs, currentFolder]);
  const parentFolder =
    breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;
  const showInContentBreadcrumb =
    currentFolder?.parentId !== null &&
    breadcrumbs.length > 1;
  const showHeaderBreadcrumb =
    currentFolder?.parentId !== null &&
    breadcrumbs.length > 1;

  const childFolders = useMemo(() => {
    if (!currentFolderId) return [];
    return sortFolders(
      folders.filter((folder) => folder.parentId === currentFolderId)
    );
  }, [folders, currentFolderId]);
  const childrenByParentId = useMemo(() => {
    const byParent = new Map<string, Folder[]>();
    folders.forEach((folder) => {
      if (!folder.parentId) return;
      const group = byParent.get(folder.parentId);
      if (group) {
        group.push(folder);
      } else {
        byParent.set(folder.parentId, [folder]);
      }
    });
    byParent.forEach((group) => {
      group.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    });
    return byParent;
  }, [folders]);
  const parentIdsWithChildren = useMemo(() => {
    return new Set(childrenByParentId.keys());
  }, [childrenByParentId]);
  const bookmarkCountByFolderId = useMemo(() => {
    const counts = new Map<string, number>();
    bookmarks.forEach((bookmark) => {
      if (!bookmark.folderId) return;
      counts.set(bookmark.folderId, (counts.get(bookmark.folderId) ?? 0) + 1);
    });
    return counts;
  }, [bookmarks]);
  const bookmarksByFolderId = useMemo(() => {
    const byFolder = new Map<string, Bookmark[]>();
    bookmarks.forEach((bookmark) => {
      if (!bookmark.folderId) return;
      const group = byFolder.get(bookmark.folderId);
      if (group) {
        group.push(bookmark);
      } else {
        byFolder.set(bookmark.folderId, [bookmark]);
      }
    });
    return byFolder;
  }, [bookmarks]);
  const childPreviewByParentId = useMemo(() => {
    const previews = new Map<string, Array<{ id: string; name: string; bookmarkCount: number }>>();
    childrenByParentId.forEach((children, parentId) => {
      previews.set(
        parentId,
        children.map((child) => ({
          id: child.id,
          name: child.name,
          bookmarkCount: bookmarkCountByFolderId.get(child.id) ?? 0,
        }))
      );
    });
    return previews;
  }, [childrenByParentId, bookmarkCountByFolderId]);

  const folderItems = useMemo(() => {
    if (!currentFolder) return [];

    return bookmarks.filter((bookmark) => {
      if (bookmark.folderId === currentFolder.id) return true;
      if (bookmark.folderId !== undefined && bookmark.folderId !== null) return false;

      const legacyLabel = normalizeFolderName(bookmark.folder ?? "");
      if (!legacyLabel) return false;
      return (
        currentFolder.parentId === null &&
        folderNameKey(currentFolder.name) === folderNameKey(legacyLabel)
      );
    });
  }, [bookmarks, currentFolder]);

  const folderOptions = useMemo(() => {
    return makeFolderOptions(folders);
  }, [folders]);

  const addFolderOption = (name: string) => {
    const normalized = normalizeFolderName(name);
    if (!normalized) return null;
    const created = addFolder({ name: normalized, parentId: null });
    return created?.id ?? null;
  };

  const createSubfolder = () => {
    if (!currentFolderId) return;
    const normalized = normalizeFolderName(newSubfolderName);
    if (!normalized) {
      setNewSubfolderError("Folder name is required.");
      return;
    }
    const created = addFolder({ name: normalized, parentId: currentFolderId });
    if (!created) {
      setNewSubfolderError("A subfolder with this name already exists.");
      return;
    }
    setNewSubfolderName("");
    setNewSubfolderError("");
    setShowNewSubfolderModal(false);
    router.push(`/folders/${encodeURIComponent(created.id)}`);
  };

  const applyRenameFolder = () => {
    if (!currentFolderId) return;
    const normalized = normalizeFolderName(renameFolderName);
    if (!normalized) {
      setRenameFolderError("Folder name is required.");
      return;
    }
    const result = updateFolder(currentFolderId, { name: normalized });
    if (!result.ok) {
      setRenameFolderError(result.reason);
      return;
    }
    setRenameFolderError("");
    setShowRenameFolderModal(false);
  };

  const applyDeleteFolder = () => {
    if (!currentFolder) return;
    const result = deleteFolder(currentFolder.id);
    if (!result.ok) {
      setFolderActionError(result.reason);
      return;
    }
    const parentTarget = currentFolder.parentId
      ? `/folders/${encodeURIComponent(currentFolder.parentId)}`
      : "/";
    router.push(parentTarget);
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
    setSelectedBookmarkIds(Array.from(new Set(folderItems.map((bookmark) => bookmark.id))));
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

  if (!currentFolder) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/5 transition hover:border-blue-400 hover:text-white active:scale-[0.98]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Home</span>
        </Link>
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
          Folder not found.
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/5 transition hover:border-blue-400 hover:text-white active:scale-[0.98]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>

          {showHeaderBreadcrumb && (
            <nav className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-slate-400">
              {breadcrumbs.map((segment, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <span key={segment.id} className="inline-flex items-center gap-1">
                    {isLast ? (
                      <span className="font-semibold text-slate-200">{segment.name}</span>
                    ) : (
                      <Link
                        href={`/folders/${encodeURIComponent(segment.id)}`}
                        className="text-slate-300 hover:text-white"
                      >
                        {segment.name}
                      </Link>
                    )}
                    {!isLast && <span className="text-slate-500">/</span>}
                  </span>
                );
              })}
            </nav>
          )}

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-100">
              {currentFolder.name}
            </h1>
            <p className="text-xs text-slate-400">
              {folderItems.length} bookmark{folderItems.length !== 1 ? "s" : ""}
              {" • "}
              {childFolders.length} subfolder{childFolders.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconAction
            label={bookmarkSelectMode ? "Done selecting" : "Select"}
            icon={<CheckSquare className="h-4 w-4" />}
            active={bookmarkSelectMode}
            onClick={() => {
              if (bookmarkSelectMode) {
                clearSelectionAndExit();
                return;
              }
              setBookmarkSelectMode(true);
              setSelectedBookmarkIds([]);
            }}
          />
          <IconAction
            label="New subfolder"
            icon={<FolderPlus className="h-4 w-4" />}
            onClick={() => {
              setFolderActionError("");
              setNewSubfolderError("");
              setNewSubfolderName("");
              setShowNewSubfolderModal(true);
            }}
          />
          <IconAction
            label="Rename"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => {
              setFolderActionError("");
              setRenameFolderError("");
              setRenameFolderName(currentFolder.name);
              setShowRenameFolderModal(true);
            }}
          />
          <IconAction
            label="Delete"
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => {
              setFolderActionError("");
              setShowDeleteFolderConfirm(true);
            }}
          />
        </div>
      </header>
      {folderActionError && (
        <div className="mb-3 rounded-xl border border-red-800/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {folderActionError}
        </div>
      )}

      {showInContentBreadcrumb && (
        <section className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 px-3 py-2">
          {parentFolder && (
            <div className="shrink-0">
              <IconAction
                href={`/folders/${encodeURIComponent(parentFolder.id)}`}
                label="Go to parent folder"
                icon={<ArrowLeft className="h-4 w-4" />}
              />
            </div>
          )}
          <nav className="min-w-0 flex-1 text-right text-xs text-slate-300">
            <span
              className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap align-middle"
              style={{ direction: "rtl" }}
            >
              <span style={{ direction: "ltr" }}>
                {breadcrumbs.map((segment, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <span key={`content-${segment.id}`} className="inline-flex items-center gap-1">
                      {isLast ? (
                        <span className="font-semibold text-slate-100">{segment.name}</span>
                      ) : (
                        <Link
                          href={`/folders/${encodeURIComponent(segment.id)}`}
                          className="text-slate-200 hover:text-white"
                        >
                          {segment.name}
                        </Link>
                      )}
                      {!isLast && <span className="text-slate-500">/</span>}
                    </span>
                  );
                })}
              </span>
            </span>
          </nav>
        </section>
      )}

      {childFolders.length > 0 && (
        <section className="mb-5 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Subfolders
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {childFolders.map((folder) => {
              return (
                <FolderCard
                  key={folder.id}
                  name={folder.name}
                  count={bookmarkCountByFolderId.get(folder.id) ?? 0}
                  subfolderCount={childrenByParentId.get(folder.id)?.length ?? 0}
                  previews={bookmarksByFolderId.get(folder.id) ?? []}
                  childFolders={childPreviewByParentId.get(folder.id)}
                  hasChildren={parentIdsWithChildren.has(folder.id)}
                  isEmpty={(bookmarkCountByFolderId.get(folder.id) ?? 0) === 0}
                  onOpen={() => {
                    router.push(`/folders/${encodeURIComponent(folder.id)}`);
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

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
              folderOptions={folderOptions}
              folderName={currentFolder.name}
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
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
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

      {showNewSubfolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowNewSubfolderModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="New subfolder"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">New subfolder</h3>
              <button
                type="button"
                onClick={() => setShowNewSubfolderModal(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
              <p className="text-xs text-slate-400">
                You are in{" "}
                <span className="font-semibold text-slate-200">
                  {currentPathLabel || currentFolder.name}
                </span>
              </p>
            </div>
            <input
              type="text"
              placeholder="Subfolder name"
              value={newSubfolderName}
              onChange={(e) => {
                setNewSubfolderName(e.target.value);
                if (newSubfolderError) setNewSubfolderError("");
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                createSubfolder();
              }}
            />
            {newSubfolderError && (
              <p className="mt-2 text-xs text-red-400">{newSubfolderError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewSubfolderModal(false)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createSubfolder}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowRenameFolderModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Rename folder"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Rename folder</h3>
              <button
                type="button"
                onClick={() => setShowRenameFolderModal(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <input
              type="text"
              placeholder="Folder name"
              value={renameFolderName}
              onChange={(e) => {
                setRenameFolderName(e.target.value);
                if (renameFolderError) setRenameFolderError("");
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                applyRenameFolder();
              }}
            />
            {renameFolderError && (
              <p className="mt-2 text-xs text-red-400">{renameFolderError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRenameFolderModal(false)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyRenameFolder}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteFolderConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowDeleteFolderConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Delete folder"
          >
            <h2 className="mb-2 text-base font-semibold text-slate-50">Delete folder?</h2>
            <p className="mb-4 text-xs text-slate-400">
              Subfolders block deletion. Bookmarks in this folder move to Unstaged.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteFolderConfirm(false)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyDeleteFolder}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
              >
                Delete
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
