//src/app/(app)/folders/manage/page.tsx
"use client";

import { Modal as BaseModal } from "@/components/Modal";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { HighlightedText } from "@/components/HighlightedText";
import { ChevronUp, DotsVertical, ExternalLink, FolderMoveInto, FolderPlus, FolderTree, Pencil, Trash2 } from "@/components/icons";
import { useBookmarks, normalizeFolderName } from "@/hooks/useBookmarks";
import { makeFolderOptions } from "@/utils/folderOptions";
import {
  baseKey,
  buildOrganizePlan,
  folderIconFor,
  planHasChanges,
} from "@/utils/autoOrganize";
import type { Folder } from "@/types/folder";
import { FIELD_CLASS } from "@/components/ui/Field";

type SortMode = "name" | "count";

type FolderOption = { id: string; name: string; label: string };

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

// A titled dialog with a Close button, on the shared Modal (Escape, focus trap,
// scroll lock, focus restore).
function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <BaseModal
      open
      onClose={onClose}
      label={title}
      panelClassName="mx-auto w-[min(560px,calc(100%-2rem))] rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl outline-none"
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
    </BaseModal>
  );
}

function OptionToggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-800/40"
    >
      <span className="min-w-0">
        <span className="block text-sm text-slate-200">{title}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
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
  const {
    bookmarks,
    folders,
    addFolder,
    updateFolder,
    updateBookmark,
    deleteFolder,
    mergeFolder,
  } = useBookmarks(userId);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [excludedCats, setExcludedCats] = useState<Set<string>>(new Set());
  const [refileLoose, setRefileLoose] = useState(true);
  const [mergeEnabled, setMergeEnabled] = useState(true);
  const [applying, setApplying] = useState(false);
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

  // Children grouped by parent (null = top level) — the tree's adjacency list.
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      const list = map.get(key);
      if (list) list.push(folder);
      else map.set(key, [folder]);
    });
    return map;
  }, [folders]);

  const folderOptionById = useMemo(
    () => new Map(folderOptions.map((option) => [option.id, option])),
    [folderOptions]
  );

  const stats = useMemo(() => {
    const nested = folders.filter((folder) => folder.parentId).length;
    let empty = 0;
    let filed = 0;
    folders.forEach((folder) => {
      const count = bookmarkCountByFolderId.get(folder.id) ?? 0;
      if (count === 0) empty += 1;
      filed += count;
    });
    return { total: folders.length, nested, empty, filed };
  }, [folders, bookmarkCountByFolderId]);

  const sortFolders = (list: Folder[]): Folder[] => {
    const arr = [...list];
    if (sortMode === "count") {
      arr.sort(
        (a, b) =>
          (bookmarkCountByFolderId.get(b.id) ?? 0) -
            (bookmarkCountByFolderId.get(a.id) ?? 0) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    } else {
      arr.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    }
    return arr;
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allCollapsed =
    folderIdsWithChildren.size > 0 &&
    [...folderIdsWithChildren].every((id) => collapsed.has(id));

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

  // Mobile action sheet open: lock body scroll + close on Escape (the blurred
  // backdrop handles outside taps).
  useEffect(() => {
    if (!openMenuId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

  // Lock scroll + Escape-to-close for the Auto-organize overlay.
  useEffect(() => {
    if (!organizeOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !applying) setOrganizeOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [organizeOpen, applying]);

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

  const organizePlan = useMemo(
    () =>
      organizeOpen ? buildOrganizePlan(bookmarks, folders, { refileLoose }) : null,
    [organizeOpen, bookmarks, folders, refileLoose]
  );

  const handleAutoOrganize = () => {
    if (!planHasChanges(buildOrganizePlan(bookmarks, folders, { refileLoose: true }))) {
      setNotice({
        type: "success",
        message: "Folders already look tidy — nothing to organize.",
      });
      return;
    }
    setExcludedCats(new Set());
    setRefileLoose(true);
    setMergeEnabled(true);
    setOrganizeOpen(true);
  };

  const toggleCat = (key: string) =>
    setExcludedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Live totals for the selected categories (drives the metrics + footer).
  const organizeSummary = useMemo(() => {
    if (!organizePlan)
      return { folders: 0, bookmarks: 0, newParents: 0, cats: 0, merges: 0 };
    let f = 0;
    let b = 0;
    let newParents = 0;
    let cats = 0;
    organizePlan.categories.forEach((c) => {
      if (excludedCats.has(c.key)) return;
      cats += 1;
      f += c.folders.length;
      b += c.bookmarks.length;
      if (c.parentIsNew) newParents += 1;
    });
    return {
      folders: f,
      bookmarks: b,
      newParents,
      cats,
      merges: mergeEnabled ? organizePlan.merges.length : 0,
    };
  }, [organizePlan, excludedCats, mergeEnabled]);

  const applyOrganize = () => {
    if (!organizePlan || applying) return;
    setApplying(true);
    const plan = organizePlan;
    // Defer so "Applying…" paints before the synchronous (batched) work.
    setTimeout(() => {
      let merged = 0;
      let nested = 0;
      let refiled = 0;
      let created = 0;
      let badged = 0;

      if (mergeEnabled)
        plan.merges.forEach((m) => {
          if (mergeFolder(m.sourceId, m.targetId).ok) merged += 1;
        });

      plan.categories.forEach((c) => {
        if (excludedCats.has(c.key)) return;
        let parentId = c.parentFolderId ?? null;
        if (c.parentIsNew) {
          const folder = addFolder({ name: c.parentName, parentId: null });
          if (folder) {
            parentId = folder.id;
            created += 1;
          } else {
            parentId =
              folders.find(
                (f) => !f.parentId && baseKey(f.name) === baseKey(c.parentName)
              )?.id ?? null;
          }
        } else if (c.parentRename && parentId) {
          if (updateFolder(parentId, { name: c.parentRename.to }).ok) badged += 1;
        }
        if (!parentId) return;
        const pid = parentId;
        c.folders.forEach((f) => {
          if (updateFolder(f.id, { parentId: pid }).ok) nested += 1;
        });
        c.bookmarks.forEach((bk) => {
          updateBookmark(bk.id, { folderId: pid });
          refiled += 1;
        });
      });

      setApplying(false);
      setOrganizeOpen(false);
      setNotice({
        type: "success",
        message: `Organized · ${nested} folders nested · ${refiled} refiled · ${created} groups created · ${merged} merged · ${badged} badged. Sync to cloud to keep it.`,
      });
    }, 40);
  };

  const folderCoverage = organizePlan
    ? organizeSummary.folders + organizePlan.unmatchedFolders
    : 0;
  const folderCoveragePct =
    folderCoverage > 0
      ? Math.round((organizeSummary.folders / folderCoverage) * 100)
      : 0;

  const renderRow = (
    option: FolderOption,
    depth: number,
    displayName: string,
    hasChildren: boolean,
    isCollapsed: boolean,
    onToggle?: () => void
  ): React.ReactNode => {
    const count = bookmarkCountByFolderId.get(option.id) ?? 0;
    const childCount = childrenByParent.get(option.id)?.length ?? 0;
    const hasMergeTarget = folderOptions.some((o) => o.id !== option.id);
    const menuOpen = openMenuId === option.id;
    const { icon, label } = folderIconFor(displayName);

    return (
      <div
        key={option.id}
        className="relative z-0 flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 py-2 pr-3"
        style={{ paddingLeft: 12 + depth * 22 }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {hasChildren && onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={isCollapsed ? "Expand subfolders" : "Collapse subfolders"}
              aria-expanded={!isCollapsed}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
            >
              <ChevronUp
                className={`h-3.5 w-3.5 transition ${isCollapsed ? "rotate-90" : "rotate-180"}`}
              />
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/60 text-base leading-none">
            {icon}
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold text-slate-100"
              title={option.label}
            >
              <HighlightedText text={label} query={query} />
            </p>
            <p className="text-xs text-slate-400">
              {count} bookmark{count !== 1 ? "s" : ""}
              {childCount > 0
                ? ` · ${childCount} subfolder${childCount !== 1 ? "s" : ""}`
                : ""}
            </p>
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-2">
          {/* Desktop: full row of icon buttons (unchanged). */}
          <div className="hidden items-center gap-2 sm:flex">
          <Link
            href={`/folders/${encodeURIComponent(option.id)}`}
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
            onClick={() => handleOpenRename(option)}
            className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            type="button"
            title={hasChildren ? "Cannot delete folder with subfolders" : "Delete"}
            aria-label="Delete folder"
            disabled={hasChildren}
            onClick={() => handleOpenDelete(option)}
            className={`${iconButtonBaseClassName} border-red-700/60 bg-red-900/30 text-red-200 hover:border-red-400 hover:bg-red-900/60 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-red-700/60 disabled:hover:bg-red-900/30`}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            title={hasMergeTarget ? "Merge" : "No merge target"}
            aria-label="Merge folder"
            disabled={!hasMergeTarget}
            onClick={() => handleOpenMerge(option)}
            className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-700/70 disabled:hover:bg-slate-900/70`}
          >
            <FolderTree className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="Move folder"
            aria-label="Move folder"
            onClick={() => handleOpenMove(option)}
            className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60`}
          >
            <FolderMoveInto className="h-4 w-4" />
          </button>
          </div>

          {/* Mobile: open a bottom action sheet (rendered above all cards). */}
          <button
            type="button"
            aria-label="Folder actions"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setOpenMenuId(option.id)}
            className={`${iconButtonBaseClassName} hover:border-slate-500/80 hover:bg-slate-800/60 sm:hidden`}
          >
            <DotsVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderTree = (parentId: string | null, depth: number): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];
    sortFolders(childrenByParent.get(parentId) ?? []).forEach((folder) => {
      const option = folderOptionById.get(folder.id);
      if (!option) return;
      const hasKids = (childrenByParent.get(folder.id)?.length ?? 0) > 0;
      const isCollapsed = collapsed.has(folder.id);
      rows.push(
        renderRow(
          option,
          depth,
          folder.name,
          hasKids,
          isCollapsed,
          hasKids ? () => toggleCollapsed(folder.id) : undefined
        )
      );
      if (hasKids && !isCollapsed) rows.push(...renderTree(folder.id, depth + 1));
    });
    return rows;
  };

  const isSearching = query.trim().length > 0;
  const menuFolder = openMenuId
    ? folderOptionById.get(openMenuId) ?? null
    : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Folder management</h1>
          <p className="text-xs text-slate-400">
            See your folder tree at a glance — open, rename, move, merge, or delete.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Smart-sort bookmarks into badged category folders"
            aria-label="Auto-organize"
            onClick={handleAutoOrganize}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/50 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200 transition hover:border-blue-400 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80"
          >
            ✨ <span>Auto-organize</span>
          </button>
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
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>+ Folder</span>
          </button>
          <Link
            href="/"
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-slate-50"
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Folders
          </h2>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {stats.total} folder{stats.total !== 1 ? "s" : ""}
            {stats.nested > 0 ? ` · ${stats.nested} nested` : ""}
            {` · ${stats.filed} filed`}
            {stats.empty > 0 ? ` · ${stats.empty} empty` : ""}
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search folders by path or name"
            className="min-w-[200px] flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900 p-0.5">
            {(
              [
                ["name", "A–Z"],
                ["count", "Most"],
              ] as [SortMode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sortMode === value}
                onClick={() => setSortMode(value)}
                title={value === "count" ? "Most bookmarks first" : "Alphabetical"}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  sortMode === value
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {folderIdsWithChildren.size > 0 && !isSearching && (
            <button
              type="button"
              onClick={() =>
                setCollapsed(
                  allCollapsed ? new Set() : new Set(folderIdsWithChildren)
                )
              }
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </div>

        {isSearching && (
          <p className="mb-2 text-xs text-slate-400">
            Showing {filteredFolderOptions.length} of {folderOptions.length}
          </p>
        )}

        {folderOptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
            No folders yet.
          </div>
        ) : isSearching ? (
          filteredFolderOptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400">
              No folders match your search.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFolderOptions.map((option) =>
                renderRow(
                  option,
                  0,
                  option.label,
                  folderIdsWithChildren.has(option.id),
                  false
                )
              )}
            </div>
          )
        ) : (
          <div className="space-y-2">{renderTree(null, 0)}</div>
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
            className={FIELD_CLASS}
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
            className={FIELD_CLASS}
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
            className={FIELD_CLASS}
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
            className={FIELD_CLASS}
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

      {organizeOpen && organizePlan && (
        <BaseModal
          open
          onClose={() => !applying && setOrganizeOpen(false)}
          label="Auto-organize"
          overlayClassName="inset-0 flex items-end justify-center sm:items-center sm:p-4"
          panelClassName="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-800 bg-slate-950 shadow-2xl sm:rounded-3xl outline-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-50">
                ✨ Auto-organize
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Tidy your folders into badged categories. Nothing changes
                until you apply.
              </p>
            </div>
            <button
              type="button"
              onClick={() => !applying && setOrganizeOpen(false)}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              Close
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Nest folders", value: organizeSummary.folders },
                { label: "Refile loose", value: organizeSummary.bookmarks },
                { label: "New groups", value: organizeSummary.newParents },
                { label: "Merge dups", value: organizeSummary.merges },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-slate-800/70 bg-slate-900/50 px-3 py-2.5 text-center"
                >
                  <p className="text-xl font-semibold tabular-nums text-slate-50">
                    {m.value}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                    {m.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Folder coverage */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-slate-400">
                <span>Top-level folders sorted</span>
                <span className="tabular-nums text-slate-300">
                  {organizeSummary.folders}/{folderCoverage} · {folderCoveragePct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${folderCoveragePct}%` }}
                />
              </div>
            </div>

            {/* Options */}
            <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-1.5">
              <OptionToggle
                checked={refileLoose}
                onChange={() => setRefileLoose((v) => !v)}
                title="Refile loose bookmarks"
                hint="Unfiled bookmarks → matching category folder"
              />
              {organizePlan.merges.length > 0 && (
                <OptionToggle
                  checked={mergeEnabled}
                  onChange={() => setMergeEnabled((v) => !v)}
                  title={`Merge ${organizePlan.merges.length} duplicate folder${
                    organizePlan.merges.length !== 1 ? "s" : ""
                  }`}
                  hint="Same-name folders combined into one"
                />
              )}
            </div>

            {/* Categories — selectable */}
            {organizePlan.categories.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Categories — tap to include / skip
                </p>
                <div className="space-y-1.5">
                  {organizePlan.categories.map((c) => {
                    const off = excludedCats.has(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-pressed={!off}
                        onClick={() => toggleCat(c.key)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                          off
                            ? "border-slate-800 bg-slate-900/30 opacity-50"
                            : "border-slate-700 bg-slate-900/70 hover:border-slate-600"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                            <span className="truncate">{c.parentName}</span>
                            {c.parentIsNew && (
                              <span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                                new
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                            {c.folders.length > 0 &&
                              `${c.folders.length} folder${c.folders.length !== 1 ? "s" : ""}`}
                            {c.folders.length > 0 && c.bookmarks.length > 0 && " · "}
                            {c.bookmarks.length > 0 &&
                              `${c.bookmarks.length} bookmark${c.bookmarks.length !== 1 ? "s" : ""}`}
                            {c.folders.length > 0 && (
                              <span className="text-slate-500">
                                {"  "}
                                {c.folders.slice(0, 3).map((f) => f.name).join(", ")}
                                {c.folders.length > 3 ? "…" : ""}
                              </span>
                            )}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-xs font-medium ${
                            off ? "text-slate-500" : "text-blue-300"
                          }`}
                        >
                          {off ? "Skip" : "Include"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="border-t border-slate-800/70 pt-3 text-[11px] text-slate-500">
              {organizePlan.unmatchedFolders} folder
              {organizePlan.unmatchedFolders !== 1 ? "s" : ""} and{" "}
              {organizePlan.looseUncategorized} loose bookmark
              {organizePlan.looseUncategorized !== 1 ? "s" : ""} couldn&apos;t be
              categorized — left untouched.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-800/70 px-5 py-3">
            <p className="min-w-0 truncate text-xs text-slate-400">
              {organizeSummary.cats === 0 && organizeSummary.merges === 0
                ? "Nothing selected"
                : `${organizeSummary.folders + organizeSummary.bookmarks} items → ${organizeSummary.cats} categor${organizeSummary.cats === 1 ? "y" : "ies"}`}
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setOrganizeOpen(false)}
                disabled={applying}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyOrganize}
                disabled={
                  applying ||
                  (organizeSummary.cats === 0 && organizeSummary.merges === 0)
                }
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
              >
                {applying ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </BaseModal>
      )}

      {/* Mobile action sheet — slides up over a blurred backdrop so it never
          sits behind the folder cards. Hidden on desktop (icon row is shown). */}
      {menuFolder && (
        <div
          style={{ bottom: "var(--bottom-nav-h)" }}
          className="fixed inset-x-0 top-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:hidden"
          onClick={() => setOpenMenuId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Actions for ${menuFolder.label}`}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl border-t border-slate-800 bg-slate-950 p-2 pb-3 shadow-2xl"
          >
            <div
              className="mx-auto my-1.5 h-1 w-10 rounded-full bg-slate-700"
              aria-hidden="true"
            />
            <p className="truncate px-3 pb-2 text-xs font-medium text-slate-400">
              {menuFolder.label}
            </p>

            <Link
              href={`/folders/${encodeURIComponent(menuFolder.id)}`}
              onClick={() => setOpenMenuId(null)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-100 transition active:bg-slate-800"
            >
              <ExternalLink className="h-5 w-5 text-slate-400" /> Open
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpenMenuId(null);
                handleOpenRename(menuFolder);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-100 transition active:bg-slate-800"
            >
              <Pencil className="h-5 w-5 text-slate-400" /> Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenMenuId(null);
                handleOpenMove(menuFolder);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-100 transition active:bg-slate-800"
            >
              <FolderMoveInto className="h-5 w-5 text-slate-400" /> Move
            </button>
            <button
              type="button"
              disabled={folderOptions.length <= 1}
              onClick={() => {
                setOpenMenuId(null);
                handleOpenMerge(menuFolder);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-100 transition active:bg-slate-800 disabled:opacity-40 disabled:active:bg-transparent"
            >
              <FolderTree className="h-5 w-5 text-slate-400" /> Merge
            </button>
            <button
              type="button"
              disabled={folderIdsWithChildren.has(menuFolder.id)}
              onClick={() => {
                setOpenMenuId(null);
                handleOpenDelete(menuFolder);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-300 transition active:bg-red-950/40 disabled:opacity-40 disabled:active:bg-transparent"
            >
              <Trash2 className="h-5 w-5" /> Delete
              {folderIdsWithChildren.has(menuFolder.id) && (
                <span className="text-[11px] text-slate-500">(has subfolders)</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setOpenMenuId(null)}
              className="mt-1 w-full rounded-xl border border-slate-800 px-3 py-3 text-sm font-medium text-slate-300 transition active:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
            className={FIELD_CLASS}
            placeholder="Folder name"
            autoFocus
          />

          <select
            value={createParentId}
            onChange={(event) => {
              setCreateParentId(event.target.value);
              if (createError) setCreateError("");
            }}
            className={FIELD_CLASS}
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
