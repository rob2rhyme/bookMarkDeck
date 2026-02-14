//src/app/(app)/folders/manage/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { ArrowLeft, ExternalLink, FolderPlus, FolderTree, Pencil, Trash2 } from "@/components/icons";
import { useBookmarks, normalizeFolderName } from "@/hooks/useBookmarks";
import { makeFolderOptions } from "@/utils/folderOptions";

type FolderOption = { id: string; name: string; label: string };

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-auto w-[min(560px,calc(100%-2rem))] rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function collectDescendantFolderIds(
  sourceId: string,
  folders: Array<{ id: string; parentId: string | null }>
): Set<string> {
  const descendants = new Set<string>();
  const queue: string[] = [sourceId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    folders.forEach((folder) => {
      if (folder.parentId !== current) return;
      if (descendants.has(folder.id)) return;
      descendants.add(folder.id);
      queue.push(folder.id);
    });
  }

  return descendants;
}

export default function FolderManagementPage() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const { bookmarks, folders, addFolder, updateFolder, deleteFolder, mergeFolder } = useBookmarks(
    userId
  );

  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createParentId, setCreateParentId] = useState("__root__");
  const [createError, setCreateError] = useState("");

  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");

  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState("__unstaged__");
  const [deleteError, setDeleteError] = useState("");

  const [mergeSourceId, setMergeSourceId] = useState<string>("");
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [mergeError, setMergeError] = useState("");
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("__top__");
  const [moveError, setMoveError] = useState("");

  const folderOptions = useMemo(() => makeFolderOptions(folders), [folders]);

  const filteredFolderOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return folderOptions;
    return folderOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(normalizedQuery) ||
        option.name.toLowerCase().includes(normalizedQuery)
    );
  }, [folderOptions, query]);

  const folderLabelById = useMemo(
    () => new Map(folderOptions.map((option) => [option.id, option.label])),
    [folderOptions]
  );

  const bookmarkCountByFolderId = useMemo(() => {
    const counts = new Map<string, number>();
    bookmarks.forEach((bookmark) => {
      if (!bookmark.folderId) return;
      counts.set(bookmark.folderId, (counts.get(bookmark.folderId) ?? 0) + 1);
    });
    return counts;
  }, [bookmarks]);

  const deleteSourceCount = deleteSourceId
    ? bookmarkCountByFolderId.get(deleteSourceId) ?? 0
    : 0;
  const mergeSourceCount = mergeSourceId
    ? bookmarkCountByFolderId.get(mergeSourceId) ?? 0
    : 0;
  const moveSourceLabel = moveSourceId
    ? folderLabelById.get(moveSourceId) ?? "Folder"
    : "Folder";

  const folderIdsWithChildren = useMemo(() => {
    const parentIds = new Set<string>();
    folders.forEach((folder) => {
      if (folder.parentId) parentIds.add(folder.parentId);
    });
    return parentIds;
  }, [folders]);

  const iconButtonBaseClassName =
    "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

  const firstMergeTargetFor = (sourceId: string): string => {
    return folderOptions.find((option) => option.id !== sourceId)?.id ?? "";
  };

  const invalidMoveTargetIds = useMemo(() => {
    if (!moveSourceId) return new Set<string>();
    const descendants = collectDescendantFolderIds(moveSourceId, folders);
    descendants.add(moveSourceId);
    return descendants;
  }, [moveSourceId, folders]);

  const moveDestinationOptions = useMemo(() => {
    if (!moveSourceId) return folderOptions;
    return folderOptions.filter((option) => !invalidMoveTargetIds.has(option.id));
  }, [folderOptions, moveSourceId, invalidMoveTargetIds]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const closeRenameModal = () => {
    setRenameFolderId(null);
    setRenameValue("");
    setRenameError("");
  };

  const closeDeleteModal = () => {
    setDeleteSourceId(null);
    setDeleteTarget("__unstaged__");
    setDeleteError("");
  };

  const closeMergeModal = () => {
    setMergeSourceId("");
    setMergeTargetId("");
    setMergeError("");
  };

  const closeMoveModal = () => {
    setMoveSourceId(null);
    setMoveTargetId("__top__");
    setMoveError("");
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateName("");
    setCreateParentId("__root__");
    setCreateError("");
  };

  const handleOpenRename = (folder: FolderOption) => {
    setDeleteSourceId(null);
    setMergeSourceId("");
    setMergeTargetId("");
    setMergeError("");
    setMoveSourceId(null);
    setMoveTargetId("__top__");
    setMoveError("");
    setRenameFolderId(folder.id);
    setRenameValue(folder.name);
    setRenameError("");
  };

  const handleOpenDelete = (folder: FolderOption) => {
    setRenameFolderId(null);
    setRenameValue("");
    setRenameError("");
    setMergeSourceId("");
    setMergeTargetId("");
    setMergeError("");
    setMoveSourceId(null);
    setMoveTargetId("__top__");
    setMoveError("");
    setDeleteSourceId(folder.id);
    setDeleteTarget("__unstaged__");
    setDeleteError("");
  };

  const handleOpenMerge = (folder: FolderOption) => {
    const firstTarget = firstMergeTargetFor(folder.id);
    setRenameFolderId(null);
    setRenameValue("");
    setRenameError("");
    setDeleteSourceId(null);
    setDeleteTarget("__unstaged__");
    setDeleteError("");
    setMoveSourceId(null);
    setMoveTargetId("__top__");
    setMoveError("");
    setMergeSourceId(folder.id);
    setMergeTargetId(firstTarget);
    setMergeError("");
  };

  const handleOpenMove = (folder: FolderOption) => {
    setRenameFolderId(null);
    setRenameValue("");
    setRenameError("");
    setDeleteSourceId(null);
    setDeleteTarget("__unstaged__");
    setDeleteError("");
    setMergeSourceId("");
    setMergeTargetId("");
    setMergeError("");
    setMoveSourceId(folder.id);
    setMoveTargetId("__top__");
    setMoveError("");
  };

  const handleCreateFolder = () => {
    const normalizedName = normalizeFolderName(createName);
    if (!normalizedName) {
      setCreateError("Folder name is required.");
      return;
    }

    const created = addFolder({
      name: normalizedName,
      parentId: createParentId === "__root__" ? null : createParentId,
    });
    if (!created) {
      const message = "Unable to create folder. Name may already exist in this location.";
      setCreateError(message);
      setNotice({ type: "error", message });
      return;
    }

    setNotice({ type: "success", message: `Created folder "${created.name}".` });
    closeCreateModal();
  };

  const handleSaveRename = () => {
    if (!renameFolderId) return;
    const nextName = normalizeFolderName(renameValue);
    if (!nextName) {
      setRenameError("Folder name is required.");
      return;
    }

    const result = updateFolder(renameFolderId, { name: nextName });
    if (!result.ok) {
      setRenameError(result.reason);
      setNotice({ type: "error", message: result.reason });
      return;
    }

    setNotice({ type: "success", message: `Renamed folder to "${nextName}".` });
    closeRenameModal();
  };

  const handleConfirmDelete = () => {
    if (!deleteSourceId) return;

    const sourceLabel = folderLabelById.get(deleteSourceId) ?? "Folder";

    const result =
      deleteTarget === "__unstaged__"
        ? deleteFolder(deleteSourceId)
        : mergeFolder(deleteSourceId, deleteTarget);

    if (!result.ok) {
      setDeleteError(result.reason);
      setNotice({ type: "error", message: result.reason });
      return;
    }

    if (deleteTarget === "__unstaged__") {
      setNotice({
        type: "success",
        message: `Deleted "${sourceLabel}". Moved ${deleteSourceCount} bookmark${
          deleteSourceCount !== 1 ? "s" : ""
        } to Unstaged.`,
      });
    } else {
      const targetLabel = folderLabelById.get(deleteTarget) ?? "Target";
      setNotice({
        type: "success",
        message: `Moved ${deleteSourceCount} bookmark${
          deleteSourceCount !== 1 ? "s" : ""
        } to "${targetLabel}" and deleted "${sourceLabel}".`,
      });
    }

    closeDeleteModal();
  };

  const handleConfirmMerge = () => {
    if (!mergeSourceId || !mergeTargetId) {
      setMergeError("Choose a source and target folder.");
      return;
    }

    const sourceLabel = folderLabelById.get(mergeSourceId) ?? "Source";
    const targetLabel = folderLabelById.get(mergeTargetId) ?? "Target";
    const movedCount = mergeSourceCount;

    const result = mergeFolder(mergeSourceId, mergeTargetId);
    if (!result.ok) {
      setMergeError(result.reason);
      setNotice({ type: "error", message: result.reason });
      return;
    }

    setNotice({
      type: "success",
      message: `Merged "${sourceLabel}" -> "${targetLabel}". Moved ${movedCount} bookmark${
        movedCount !== 1 ? "s" : ""
      }.`,
    });
    closeMergeModal();
  };

  const handleConfirmMove = () => {
    if (!moveSourceId) return;

    const nextParentId = moveTargetId === "__top__" ? null : moveTargetId;
    if (nextParentId && invalidMoveTargetIds.has(nextParentId)) {
      setMoveError("Cannot move a folder into itself or its descendant.");
      return;
    }

    const result = updateFolder(moveSourceId, { parentId: nextParentId });
    if (!result.ok) {
      setMoveError(result.reason);
      setNotice({ type: "error", message: result.reason });
      return;
    }

    const destinationLabel = nextParentId
      ? folderLabelById.get(nextParentId) ?? "Selected folder"
      : "Top level";
    setNotice({
      type: "success",
      message: `Moved "${moveSourceLabel}" to ${destinationLabel}.`,
    });
    closeMoveModal();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Folder management</h1>
          <p className="text-xs text-slate-400">Rename, delete, and merge folders.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="New folder"
            aria-label="Create folder"
            onClick={() => {
              setCreateError("");
              setCreateName("");
              setCreateParentId("__root__");
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>+ Folder</span>
          </button>
          <Link
            href="/"
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-white"
          >
            Back home
          </Link>
        </div>
      </header>

      {notice && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            notice.type === "success"
              ? "border-emerald-800/70 bg-emerald-950/30 text-emerald-200"
              : "border-red-800/70 bg-red-950/30 text-red-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          Folders
        </h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search folders by path or name"
            className="min-w-[240px] flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400">
            Showing {filteredFolderOptions.length} of {folderOptions.length}
          </p>
        </div>

        {folderOptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No folders yet.
          </div>
        ) : filteredFolderOptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No folders match your search.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFolderOptions.map((folder) => {
              const hasMergeTarget = folderOptions.some((option) => option.id !== folder.id);
              const hasChildren = folderIdsWithChildren.has(folder.id);

              return (
                <div
                  key={folder.id}
                  className="relative z-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{folder.label}</p>
                    <p className="text-xs text-slate-400">
                      {bookmarkCountByFolderId.get(folder.id) ?? 0} bookmark
                      {(bookmarkCountByFolderId.get(folder.id) ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>

                  <div className="relative z-10 flex items-center gap-2">
                    <Link
                      href={`/folders/${encodeURIComponent(folder.id)}`}
                      title="Open"
                      aria-label="Open folder"
                      className={`${iconButtonBaseClassName} hover:border-blue-500/80 hover:bg-slate-800/60`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>

                    <button
                      type="button"
                      title="Rename"
                      aria-label="Rename folder"
                      onClick={() => handleOpenRename(folder)}
                      className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      title={
                        hasChildren ? "Cannot delete folder with subfolders" : "Delete"
                      }
                      aria-label="Delete folder"
                      disabled={hasChildren}
                      onClick={() => handleOpenDelete(folder)}
                      className={`${iconButtonBaseClassName} border-red-700/60 bg-red-900/30 text-red-200 hover:border-red-400 hover:bg-red-900/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-red-700/60 disabled:hover:bg-red-900/30`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      title={hasMergeTarget ? "Merge" : "No merge target"}
                      aria-label="Merge folder"
                      disabled={!hasMergeTarget}
                      onClick={() => handleOpenMerge(folder)}
                      className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-700/70 disabled:hover:bg-slate-900/70`}
                    >
                      <FolderTree className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      title="Move folder"
                      aria-label="Move folder"
                      onClick={() => handleOpenMove(folder)}
                      className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60`}
                    >
                      <ArrowLeft className="h-4 w-4 rotate-180" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal open={renameFolderId !== null} title="Rename folder" onClose={closeRenameModal}>
        <div className="space-y-3">
          <input
            type="text"
            value={renameValue}
            onChange={(event) => {
              setRenameValue(event.target.value);
              if (renameError) setRenameError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSaveRename();
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Folder name"
            autoFocus
          />

          {renameError && <p className="text-xs text-red-400">{renameError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeRenameModal}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveRename}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteSourceId !== null} title="Delete folder" onClose={closeDeleteModal}>
        <div className="space-y-3">
          <p className="text-xs text-red-200">
            Move {deleteSourceCount} bookmark{deleteSourceCount !== 1 ? "s" : ""} and delete this
            folder.
          </p>

          <select
            value={deleteTarget}
            onChange={(event) => {
              setDeleteTarget(event.target.value);
              if (deleteError) setDeleteError("");
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="__unstaged__">Unstaged</option>
            {folderOptions
              .filter((option) => option.id !== deleteSourceId)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </select>

          {deleteError && <p className="text-xs text-red-300">{deleteError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDeleteModal}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-500"
            >
              Confirm delete
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={mergeSourceId !== ""} title="Merge folders" onClose={closeMergeModal}>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
            Source: <span className="font-semibold text-slate-100">{folderLabelById.get(mergeSourceId) ?? "-"}</span>
          </div>

          <select
            value={mergeTargetId}
            onChange={(event) => {
              setMergeTargetId(event.target.value);
              if (mergeError) setMergeError("");
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Target folder</option>
            {folderOptions
              .filter((option) => option.id !== mergeSourceId)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </select>

          <p className="text-xs text-slate-400">
            Move {mergeSourceCount} bookmark{mergeSourceCount !== 1 ? "s" : ""} from source to
            target.
          </p>

          {mergeError && <p className="text-xs text-red-400">{mergeError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeMergeModal}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMerge}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Confirm merge
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={moveSourceId !== null} title="Move folder" onClose={closeMoveModal}>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
            Moving: <span className="font-semibold text-slate-100">{moveSourceLabel}</span>
          </div>

          <select
            value={moveTargetId}
            onChange={(event) => {
              setMoveTargetId(event.target.value);
              if (moveError) setMoveError("");
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="__top__">Top level</option>
            {moveDestinationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {moveError && <p className="text-xs text-red-400">{moveError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeMoveModal}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMove}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Move
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreateModal} title="Create folder" onClose={closeCreateModal}>
        <div className="space-y-3">
          <input
            type="text"
            value={createName}
            onChange={(event) => {
              setCreateName(event.target.value);
              if (createError) setCreateError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreateFolder();
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Folder name"
            autoFocus
          />

          <select
            value={createParentId}
            onChange={(event) => {
              setCreateParentId(event.target.value);
              if (createError) setCreateError("");
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="__root__">(Root)</option>
            {folderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {createError && <p className="text-xs text-red-400">{createError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeCreateModal}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateFolder}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
