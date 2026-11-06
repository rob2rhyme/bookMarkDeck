//src/components/HomePageClient.tsx
"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { BookmarkCard } from "@/components/BookmarkCard";
import { FolderCard } from "@/components/FolderCard";
import { HighlightedText } from "@/components/HighlightedText";
import { ShortcutIcon } from "@/components/ShortcutIcon";
import { Modal } from "@/components/Modal";
import { SectionNav, type SectionNavItem } from "@/components/SectionNav";
import { useToast } from "@/components/toast/ToastProvider";
import {
  planBackupImport,
  planHtmlImport,
  useBookmarks,
} from "@/hooks/useBookmarks";
import { useRediscoverBookmark } from "@/hooks/useRediscoverBookmark";
import { RediscoverBookmarkCard } from "@/components/RediscoverBookmarkCard";
import { WeeklyRecapCard } from "@/components/WeeklyRecapCard";
import { useShortcuts } from "@/hooks/useShortcuts";
import { Bookmark } from "@/types/bookmark";
import { Folder } from "@/types/folder";
import { ShortcutApp } from "@/types/shortcut";
import { bookmarksToNetscapeHtml } from "@/utils/bookmarksToHtml";
import { makeFolderOptions } from "@/utils/folderOptions";
import { parseBookmarkHtml } from "@/utils/parseBookmarkHtml";
import { parseServiceCsv } from "@/utils/parseServiceCsv";
import { countTags, hasTag } from "@/utils/tagBrowse";
import { queuePatch } from "@/utils/readLater";
import { fetchLinkTitle } from "@/utils/linkTitle";
import { STARTER_GROUPS, planStarterLinks } from "@/utils/starterLinks";
import { MilestoneRow } from "@/components/MilestoneRow";
import { ReadLaterCard } from "@/components/ReadLaterCard";
import { StarterPicker } from "@/components/StarterPicker";
import { isUnsafeUrl, normalizeUrl } from "@/utils/normalizeUrl";
import type { FirestoreBookmarkBackup } from "@/utils/firestoreBookmarks";
import { buildBackupFile, parseBackupJson } from "@/utils/bookmarkBackupFile";
import { FIELD_CLASS } from "@/components/ui/Field";
import { iconPath } from "@/utils/iconUrl";

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
      return iconPath(host);
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

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}


// Tag chips shown before "Show all".
const TAGS_SHOWN = 12;

export function HomePageClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const {
    bookmarks,
    folders: folderEntities,
    hydrated: bookmarksHydrated,
    addBookmark,
    nameFromPage,
    addFolder,
    updateFolder: updateFolderEntity,
    deleteFolder: deleteFolderEntity,
    updateBookmark,
    deleteBookmark,
    clearAll,
    importBookmarks,
    restoreBackup,
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

  const rediscover = useRediscoverBookmark(userId, bookmarks);
  const handleRediscoverOpen = (b: Bookmark) => {
    const target = normalizeUrl(b.url);
    if (!target) return;
    window.open(target, "_blank", "noopener,noreferrer");
    updateBookmark(b.id, {
      hits: (b.hits ?? 0) + 1,
      lastUsedAt: new Date().toISOString(),
    });
    rediscover.dismiss();
  };

  const { toast } = useToast();
  const [restoreTarget, setRestoreTarget] =
    useState<FirestoreBookmarkBackup | null>(null);
  const [importPreview, setImportPreview] = useState<{
    source: string;
    newBookmarks: number;
    duplicateBookmarks: number;
    newShortcuts: number;
    bookmarkAdditions: Bookmark[] | null;
    folderAdditions: Folder[];
    mergedShortcuts: ShortcutApp[] | null;
  } | null>(null);

  // Existing tags across all bookmarks — for add-form autocomplete chips.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookmarks)
      for (const t of b.tags ?? []) {
        const tag = t.trim();
        if (tag) set.add(tag);
      }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  const appendNewTag = (tag: string) =>
    setNewTags((cur) => {
      const parts = cur
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.some((p) => p.toLowerCase() === tag.toLowerCase())) return cur;
      return [...parts, tag].join(", ");
    });

  const [search, setSearch] = useState("");
  // Default to "favorites" so only pinned bookmarks show initially
  // Start with all bookmarks so imports are visible immediately
  const [folderFilter, setFolderFilter] = useState<string>("");
  // Browse by tag: the chosen tag's comparison key ("" = all), and whether the
  // chip row shows every tag or just the most used.
  const [tagFilter, setTagFilter] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newFolderSelection, setNewFolderSelection] = useState("__unstaged__");
  const [newTags, setNewTags] = useState(""); // NEW
  const [newReadLater, setNewReadLater] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);
const [showAddShortcutForm, setShowAddShortcutForm] = useState(false);
const [shortcutQuery, setShortcutQuery] = useState("");
const [shortcutName, setShortcutName] = useState("");
const [shortcutUrl, setShortcutUrl] = useState("");
const [shortcutIconValue, setShortcutIconValue] = useState("");
const [shortcutIconTouched, setShortcutIconTouched] = useState(false);
const [editingShortcut, setEditingShortcut] = useState<ShortcutApp | null>(null);
const [editName, setEditName] = useState("");
const [editUrl, setEditUrl] = useState("");
  const [editIconValue, setEditIconValue] = useState("");
  const [editIconTouched, setEditIconTouched] = useState(false);
  const [undoState, setUndoState] = useState<{
    type: "delete" | "bulkDelete" | "clearAll" | "import";
    snapshot: Bookmark[];
    /** Set by an import, which can add folders too: undo restores both. */
    folders?: Folder[];
  } | null>(null);
const [shortcutUndoState, setShortcutUndoState] = useState<{
  snapshot: ShortcutApp[];
} | null>(null);
const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [activeFolderLabel, setActiveFolderLabel] = useState<string>("Unstaged");
const [activeShortcutId, setActiveShortcutId] = useState<string | null>(null);
const [activeShortcutPinned, setActiveShortcutPinned] = useState(false);
const [showNewFolderModal, setShowNewFolderModal] = useState(false);
const [newFolderName, setNewFolderName] = useState("");
const [newFolderError, setNewFolderError] = useState("");
const [showRenameFolderModal, setShowRenameFolderModal] = useState(false);
const [renameFolderInput, setRenameFolderInput] = useState("");
const [renameFolderError, setRenameFolderError] = useState("");
const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState(false);
const [folderSelectMode, setFolderSelectMode] = useState(false);
const [selectedFolderKeys, setSelectedFolderKeys] = useState<string[]>([]);
const [bookmarkSelectMode, setBookmarkSelectMode] = useState(false);
const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
const [showBulkDeleteFoldersConfirm, setShowBulkDeleteFoldersConfirm] = useState(false);
const [showBulkMoveBookmarksModal, setShowBulkMoveBookmarksModal] = useState(false);
const [bookmarkBulkTarget, setBookmarkBulkTarget] = useState("__unstaged__");
const [showBulkDeleteBookmarksConfirm, setShowBulkDeleteBookmarksConfirm] = useState(false);
const newFolderRequestRef = useRef<((folderId: string) => void) | null>(null);

  const normalizeFolderName = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trim();
    return trimmed ? trimmed : null;
  };

  const folderKey = (value: string) => value.trim().toLowerCase();
  const cleanFolderLabel = (value: string) => value.replace(/\s+/g, " ").trim();

  const rootFolders = useMemo(() => {
    return [...folderEntities]
      .filter((folder) => folder.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [folderEntities]);
  const childrenByParentId = useMemo(() => {
    const byParent = new Map<string, Folder[]>();
    folderEntities.forEach((folder) => {
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
  }, [folderEntities]);
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

  const folderById = useMemo(() => {
    return new Map(folderEntities.map((folder) => [folder.id, folder]));
  }, [folderEntities]);

  const folderOptions = useMemo(() => {
    return makeFolderOptions(folderEntities);
  }, [folderEntities]);

  const addRootFolder = (name: string) => {
    const normalized = cleanFolderLabel(name);
    if (!normalized) {
      setNewFolderError("Folder name is required.");
      return null;
    }
    if (normalized.length > MAX_FOLDER_NAME) {
      setNewFolderError(`Folder name must be ${MAX_FOLDER_NAME} characters or less.`);
      return null;
    }
    const existing = rootFolders.find(
      (folder) => folderKey(folder.name) === folderKey(normalized)
    );
    if (existing) {
      setNewFolderError("Folder name already exists at root.");
      return existing.id;
    }
    const created = addFolder({ name: normalized, parentId: null });
    if (!created) {
      setNewFolderError("Unable to create folder.");
      return null;
    }
    setNewFolderError("");
    return created.id;
  };

  const openNewFolderModal = (onCreated?: (folderId: string) => void) => {
    newFolderRequestRef.current = onCreated ?? null;
    setNewFolderName("");
    setNewFolderError("");
    setShowNewFolderModal(true);
  };

  const MAX_FOLDER_NAME = 60;

  const findFolderById = (folderId: string | null) => {
    if (!folderId) return null;
    return folderById.get(folderId) ?? null;
  };

  const openRenameForActiveFolder = () => {
    if (!activeFolderKey || activeFolderKey === "UNSTAGED") return;
    setRenameFolderError("");
    setRenameFolderInput(activeFolderLabel);
    setShowRenameFolderModal(true);
  };

  const openDeleteForActiveFolder = () => {
    if (!activeFolderKey || activeFolderKey === "UNSTAGED") return;
    setShowDeleteFolderConfirm(true);
  };

  const renameFolder = (_oldLabel: string, nextLabel: string) => {
    if (!activeFolderKey || activeFolderKey === "UNSTAGED") return;
    const cleanedNext = cleanFolderLabel(nextLabel);
    if (!cleanedNext) {
      setRenameFolderError("Folder name is required.");
      return;
    }
    if (cleanedNext.length > MAX_FOLDER_NAME) {
      setRenameFolderError(`Folder name must be ${MAX_FOLDER_NAME} characters or less.`);
      return;
    }

    const result = updateFolderEntity(activeFolderKey, { name: cleanedNext });
    if (!result.ok) {
      setRenameFolderError(result.reason);
      return;
    }
    setActiveFolderLabel(cleanedNext);

    setShowRenameFolderModal(false);
    setRenameFolderError("");
  };

  const deleteFolder = (folderId: string) => {
    if (!folderId || folderId === "UNSTAGED") return;
    const result = deleteFolderEntity(folderId);
    if (!result.ok) {
      setRenameFolderError(result.reason);
      return;
    }
    if (activeFolderKey === folderId) {
      setActiveFolderKey(null);
      setActiveFolderLabel("Unstaged");
    }
    setSelectedFolderKeys((prev) => prev.filter((key) => key !== folderId));
    setShowDeleteFolderConfirm(false);
  };

  // Open the add-bookmark form when arriving via the ⌘K command palette.
  useEffect(() => {
    try {
      if (localStorage.getItem("bd:intent:add-bookmark") === "1") {
        localStorage.removeItem("bd:intent:add-bookmark");
        setShowAddForm(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!showAddForm) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAddForm(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddForm]);

  useEffect(() => {
    if (!showAddShortcutForm) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAddShortcutForm(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddShortcutForm]);

  useEffect(() => {
    if (!showNewFolderModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNewFolderModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showNewFolderModal]);

  useEffect(() => {
    if (!activeFolderKey) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveFolderKey(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFolderKey]);

  useEffect(() => {
    if (folderSelectMode) return;
    if (selectedFolderKeys.length === 0) return;
    setSelectedFolderKeys([]);
  }, [folderSelectMode, selectedFolderKeys]);

  useEffect(() => {
    if (bookmarkSelectMode) return;
    if (selectedBookmarkIds.length === 0) return;
    setSelectedBookmarkIds([]);
  }, [bookmarkSelectMode, selectedBookmarkIds]);

  useEffect(() => {
    setBookmarkSelectMode(false);
    setSelectedBookmarkIds([]);
  }, [activeFolderKey]);


  useEffect(() => {
    if (shortcutIconTouched) return;
    if (!shortcutUrl.trim()) {
      setShortcutIconValue("");
      return;
    }
    const favicon = getFaviconUrl(shortcutUrl);
    setShortcutIconValue(favicon);
  }, [shortcutUrl, shortcutIconTouched]);

  useEffect(() => {
    if (!editingShortcut) return;
    if (editIconTouched) return;
    if (editIconValue.trim()) return;
    const favicon = getFaviconUrl(editUrl);
    if (favicon) {
      setEditIconValue(favicon);
    }
  }, [editUrl, editIconValue, editIconTouched, editingShortcut]);

  const tagCounts = useMemo(() => countTags(bookmarks), [bookmarks]);

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

          // Extra filters (favorites/notes)
          let matchesExtra = true;
          if (folderFilter === "favorites") {
            // show only pinned / favorited bookmarks
            matchesExtra = !!b.pinned;
          } else if (folderFilter === "with-notes") {
            matchesExtra = !!b.note && b.note.trim().length > 0;
          }

          return matchesSearch && matchesExtra && hasTag(b, tagFilter);
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
  }, [bookmarks, search, folderFilter, tagFilter]);

  const folderBuckets = useMemo(() => {
    const byKey = new Map<string, Bookmark[]>();
    const unstaged: Bookmark[] = [];
    const rootFolderByNameKey = new Map(
      rootFolders.map((folder) => [folderKey(folder.name), folder.id])
    );
    filtered.forEach((b) => {
      const folderId = typeof b.folderId === "string" ? b.folderId : null;
      if (!folderId) {
        const legacyName = normalizeFolderName(b.folder ?? "");
        if (legacyName) {
          const mappedId = rootFolderByNameKey.get(folderKey(legacyName));
          if (mappedId) {
            const mappedBucket = byKey.get(mappedId);
            if (mappedBucket) mappedBucket.push(b);
            else byKey.set(mappedId, [b]);
            return;
          }
        }
        unstaged.push(b);
        return;
      }
      const bucket = byKey.get(folderId);
      if (bucket) {
        bucket.push(b);
      } else {
        byKey.set(folderId, [b]);
      }
    });
    return { byKey, unstaged };
  }, [filtered, rootFolders]);

  const clearFolderSelection = () => {
    setSelectedFolderKeys([]);
    setFolderSelectMode(false);
  };

  const toggleFolderSelection = (folderId: string) => {
    if (!folderId) return;
    setSelectedFolderKeys((prev) =>
      prev.includes(folderId)
        ? prev.filter((value) => value !== folderId)
        : [...prev, folderId]
    );
  };

  const applyBulkDeleteFolders = () => {
    if (selectedFolderKeys.length === 0) return;
    selectedFolderKeys.forEach((folderId) => deleteFolder(folderId));
    setShowBulkDeleteFoldersConfirm(false);
    clearFolderSelection();
  };

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

  // Search across app shortcuts (name / url).
  const filteredShortcuts = useMemo(() => {
    const q = shortcutQuery.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter((app) =>
      `${app.name} ${app.url}`.toLowerCase().includes(q)
    );
  }, [shortcuts, shortcutQuery]);

  useEffect(() => {
    if (!activeShortcutId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-shortcut-hover-root="true"]')) {
        return;
      }
      setActiveShortcutId(null);
      setActiveShortcutPinned(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveShortcutId(null);
      setActiveShortcutPinned(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeShortcutId]);

  useEffect(() => {
    if (!activeShortcutId) return;
    if (shortcuts.some((shortcut) => shortcut.id === activeShortcutId)) return;
    setActiveShortcutId(null);
    setActiveShortcutPinned(false);
  }, [activeShortcutId, shortcuts]);

  const handleShortcutHoverOpen = (id: string) => {
    if (activeShortcutId === id) return;
    setActiveShortcutId(id);
    setActiveShortcutPinned(false);
  };

  const handleShortcutTogglePinned = (
    id: string,
    keepOpenWhenUnpinned: boolean
  ) => {
    if (activeShortcutId !== id) {
      setActiveShortcutId(id);
      setActiveShortcutPinned(true);
      return;
    }

    if (!activeShortcutPinned) {
      setActiveShortcutPinned(true);
      return;
    }

    setActiveShortcutPinned(false);
    if (!keepOpenWhenUnpinned) {
      setActiveShortcutId(null);
    }
  };

  const handleShortcutRequestClose = (id: string) => {
    if (activeShortcutId !== id || activeShortcutPinned) return;
    setActiveShortcutId(null);
  };

  const handleShortcutOpenMenu = (id: string) => {
    setActiveShortcutId(id);
    setActiveShortcutPinned(true);
  };

  const handleShortcutForceClose = () => {
    setActiveShortcutId(null);
    setActiveShortcutPinned(false);
  };

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
    const iconValue = (bookmark.icon ?? "").trim();
    const iconUrl = isHttpUrl(iconValue) ? iconValue : "";
    const [faviconFailed, setFaviconFailed] = useState(false);
    const [iconImgFailed, setIconImgFailed] = useState(false);

    useEffect(() => {
      setFaviconFailed(false);
    }, [favicon]);
    useEffect(() => {
      setIconImgFailed(false);
    }, [iconUrl]);

    const shouldShowIconUrl = iconUrl && !iconImgFailed;
    const shouldShowFavicon = favicon && !faviconFailed;
    const shouldShowIconText =
      !shouldShowIconUrl && !shouldShowFavicon && iconValue.length > 0;

    const handleOpen = () => {
      // Normalize at open-time too, so pre-existing bookmarks stored with a bare
      // host (relative-open bug) or an unsafe scheme are handled safely.
      const target = normalizeUrl(bookmark.url);
      if (!target) return;
      window.open(target, "_blank", "noopener,noreferrer");
    };

    const togglePinned = () => {
      updateBookmark(bookmark.id, { pinned: !bookmark.pinned });
    };

    return (
      <div className="group relative flex h-full min-h-[92px] items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500/50 hover:bg-slate-900">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-12 w-12 min-w-[48px] items-center justify-center overflow-hidden rounded bg-slate-100 text-xl text-slate-900 ring-1 ring-white/5">
            {shouldShowIconUrl ? (
              <img
                src={iconUrl}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
                loading="lazy"
                onError={() => setIconImgFailed(true)}
              />
            ) : shouldShowFavicon ? (
              <img
                src={favicon}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 object-contain"
                loading="lazy"
                onError={() => setFaviconFailed(true)}
              />
            ) : shouldShowIconText ? (
              <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-100">
                {iconValue}
              </span>
            ) : (
              <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-100">
                {initial}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-semibold leading-tight text-slate-100">
                <HighlightedText text={bookmark.title || hostname} query={search} />
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-200 transition hover:border-blue-400 hover:text-slate-50"
            aria-label={bookmark.pinned ? "Unfavorite" : "Favorite"}
          >
            {bookmark.pinned ? "★" : "☆"}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(bookmark.id)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-300 transition hover:border-red-400 hover:bg-red-900/60 hover:text-slate-50"
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
    const url = normalizeUrl(newUrl);
    if (!url) return; // empty or a blocked scheme (javascript:/data:/…)

    const folderId =
      newFolderSelection === "__unstaged__"
        ? null
        : newFolderSelection.trim() || null;
    const folderName = folderId ? findFolderById(folderId)?.name : undefined;
    const tags = newTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const typedTitle = newTitle.trim();
    const id = addBookmark({
      title: typedTitle || url,
      url,
      note: "",
      folderId,
      folder: folderName,
      tags,
      ...(newReadLater ? queuePatch() : {}),
    });
    // Left untitled: save now under its URL, then take the page's own title.
    if (!typedTitle) {
      void fetchLinkTitle(url).then((title) => {
        if (title) nameFromPage(id, title);
      });
    }

    setNewTitle("");
    setNewUrl("");
    setNewFolderSelection("__unstaged__");
    setNewTags("");
    setNewReadLater(false);
    setShowAddForm(false);
  };

  // Empty library → "Start with a few links": each pick filed into its group's
  // folder (reusing a top-level folder of that name if there is one).
  const handleStarterLinks = (urls: string[]) => {
    const picked = STARTER_GROUPS.flatMap((g) => g.links).filter((l) => urls.includes(l.url));
    const plan = planStarterLinks(picked, bookmarks.map((b) => b.url));
    for (const { folder, links } of plan) {
      const existing = folderEntities.find(
        (f) => !f.parentId && f.name.trim().toLowerCase() === folder.toLowerCase()
      );
      const target = existing ?? addFolder({ name: folder, parentId: null });
      for (const l of links) {
        addBookmark({
          title: l.title,
          url: l.url,
          note: "",
          folderId: target?.id ?? null,
          folder: target?.name,
          tags: [],
        });
      }
    }
  };

  const handleAddShortcut = () => {
    const trimmedName = shortcutName.trim();
    const normalizedUrl = normalizeUrl(shortcutUrl);
    if (!trimmedName || !normalizedUrl) return;
    const autoIcon = getFaviconUrl(normalizedUrl);
    const icon = shortcutIconTouched ? shortcutIconValue.trim() : autoIcon;
    addShortcut({
      name: trimmedName,
      url: normalizedUrl,
      icon: icon || undefined,
    });
    setShortcutName("");
    setShortcutUrl("");
    setShortcutIconValue("");
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
    if (undoState.folders) restoreBackup(undoState.snapshot, undoState.folders);
    else restoreFromSnapshot(undoState.snapshot);
    setUndoState(null);
  };

  const handleAddLinkForFolder = (folderId: string | null) => {
    setShowAddForm(true);
    if (folderId) {
      setNewFolderSelection(folderId);
    } else {
      setNewFolderSelection("__unstaged__");
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleShortcutDelete = (id: string) => {
    if (shortcuts.length === 0) return;
    setShortcutUndoState({ snapshot: shortcuts });
    deleteShortcut(id);
  };

  const handleShortcutOpen = (app: ShortcutApp) => {
    const target = app.url.trim();
    if (!target || isUnsafeUrl(target)) return;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const handleShortcutUpdate = (id: string, data: Partial<ShortcutApp>) => {
    updateShortcut(id, data);
  };

  const handleStartShortcutEdit = (app: ShortcutApp) => {
    setEditingShortcut(app);
    setEditName(app.name);
    setEditUrl(app.url);
    setEditIconValue(app.icon ?? "");
    setEditIconTouched(false);
  };

  const handleSaveShortcutEdit = () => {
    if (!editingShortcut) return;
    const trimmedName = editName.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedName || !trimmedUrl) return;
    const autoIcon = getFaviconUrl(trimmedUrl);
    const icon = editIconTouched ? editIconValue.trim() : autoIcon;
    handleShortcutUpdate(editingShortcut.id, {
      name: trimmedName,
      url: trimmedUrl,
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

  const activeFolderItems = useMemo(() => {
    if (!activeFolderKey) return [];
    if (activeFolderKey === "UNSTAGED") return folderBuckets.unstaged;
    return folderBuckets.byKey.get(activeFolderKey) ?? [];
  }, [activeFolderKey, folderBuckets]);

  const groupedActiveFolderItems = useMemo(() => {
    const groups: Map<string, Bookmark[]> = new Map();
    activeFolderItems.forEach((bookmark) => {
      const tags = bookmark.tags && bookmark.tags.length ? bookmark.tags : ["Untagged"];
      tags.forEach((tag) => {
        const key = tag.trim() || "Untagged";
        const current = groups.get(key);
        if (current) {
          current.push(bookmark);
        } else {
          groups.set(key, [bookmark]);
        }
      });
    });
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [activeFolderItems]);

  const clearBookmarkSelection = () => {
    setSelectedBookmarkIds([]);
    setBookmarkSelectMode(false);
  };

  const toggleBookmarkSelection = (id: string) => {
    setSelectedBookmarkIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const selectAllBookmarksInActiveFolder = () => {
    const ids = Array.from(new Set(activeFolderItems.map((bookmark) => bookmark.id)));
    setSelectedBookmarkIds(ids);
  };

  const clearSelectedBookmarks = () => {
    setSelectedBookmarkIds([]);
  };

  const moveBookmarksToFolder = (targetFolderId?: string) => {
    const target =
      targetFolderId && targetFolderId.trim() ? targetFolderId.trim() : null;
    const targetName = target ? findFolderById(target)?.name : undefined;
    const uniqueIds = Array.from(new Set(selectedBookmarkIds));
    if (uniqueIds.length === 0) return;
    uniqueIds.forEach((id) => {
      updateBookmark(id, { folderId: target, folder: targetName });
    });
    setSelectedBookmarkIds([]);
    setBookmarkSelectMode(false);
    setShowBulkMoveBookmarksModal(false);
  };

  const applyBulkMoveBookmarks = () => {
    if (selectedBookmarkIds.length === 0) return;
    if (bookmarkBulkTarget === "__new__") {
      setShowBulkMoveBookmarksModal(false);
      openNewFolderModal((folderId) => {
        moveBookmarksToFolder(folderId);
      });
      return;
    }
    const target = bookmarkBulkTarget === "__unstaged__" ? undefined : bookmarkBulkTarget;
    moveBookmarksToFolder(target);
  };

  const applyBulkDeleteBookmarks = () => {
    if (selectedBookmarkIds.length === 0) return;
    setUndoState({ type: "bulkDelete", snapshot: bookmarks });
    selectedBookmarkIds.forEach((id) => deleteBookmark(id));
    setSelectedBookmarkIds([]);
    setShowBulkDeleteBookmarksConfirm(false);
  };

  const buildShortcutMerge = (imported: ShortcutApp[]) => {
    const shortcutKey = (s: ShortcutApp) => {
      const url = s.url?.trim();
      if (url) return `url:${url}`;
      if (s.id?.trim()) return `id:${s.id}`;
      const name = s.name?.trim() || "shortcut";
      return `name:${name}`;
    };
    const existingByKey = new Map(shortcuts.map((s) => [shortcutKey(s), s]));
    const merged: ShortcutApp[] = [...shortcuts];
    let added = 0;
    imported.forEach((imp) => {
      if (!existingByKey.has(shortcutKey(imp))) {
        merged.push(imp);
        added++;
      }
    });
    return { merged, added };
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();

    // Attempt JSON first (supports cross-account backups with shortcuts).
    const isLikelyJson =
      file.name.toLowerCase().endsWith(".json") || text.trim().startsWith("{");
    const parsed = isLikelyJson ? parseBackupJson(text) : null;
    if (parsed) {
      // The file's folder tree comes too, merged into yours, and each bookmark
      // follows its folder — it used to be dropped, leaving every one unstaged.
      const bm =
        parsed.bookmarks.length > 0 || parsed.folders.length > 0
          ? planBackupImport(bookmarks, folderEntities, parsed)
          : null;
      const importedShortcuts = parsed.shortcuts as ShortcutApp[];
      const sc =
        importedShortcuts.length > 0 ? buildShortcutMerge(importedShortcuts) : null;

      if (!bm && !sc) {
        toast("Nothing to import from that file.", { variant: "error" });
        return;
      }
      setImportPreview({
        source: file.name,
        newBookmarks: bm?.additions.length ?? 0,
        duplicateBookmarks: bm?.duplicate ?? 0,
        newShortcuts: sc?.added ?? 0,
        bookmarkAdditions: bm ? bm.additions : null,
        folderAdditions: bm?.folderAdditions ?? [],
        mergedShortcuts: sc ? sc.merged : null,
      });
      return;
    }
    if (isLikelyJson) console.error("JSON import failed, trying another format");

    // A CSV from Raindrop or Pocket (or any list with a "url" column); otherwise
    // a browser or Pocket HTML file. Both give the same records, so they share
    // the preview, the duplicate check, the folder planning and Undo.
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const csv = isCsv ? parseServiceCsv(text) : null;
    if (isCsv && !csv) {
      toast("That CSV has no \"url\" column, so there are no links to import.", { variant: "error" });
      return;
    }
    const imported = csv ? csv.bookmarks : parseBookmarkHtml(text);
    if (imported.length === 0) {
      toast("No bookmarks found in that file.", { variant: "error" });
      return;
    }
    // The file's folder tree is recreated (or matched to yours) and every link
    // filed in it — it used to land in Unstaged.
    const bm = planHtmlImport(bookmarks, folderEntities, imported);
    const from = csv && csv.flavour !== "generic" ? ` (${csv.flavour === "pocket" ? "Pocket" : "Raindrop"})` : "";
    setImportPreview({
      source: `${file.name}${from}`,
      newBookmarks: bm.additions.length,
      duplicateBookmarks: bm.duplicate,
      newShortcuts: 0,
      bookmarkAdditions: bm.additions,
      folderAdditions: bm.folderAdditions,
      mergedShortcuts: null,
    });
  };

  // Apply the previewed import: append what's new, leave everything else alone.
  const applyImport = () => {
    if (!importPreview) return;
    const additions = importPreview.bookmarkAdditions ?? [];
    const folderAdditions = importPreview.folderAdditions;
    if (additions.length > 0 || folderAdditions.length > 0) {
      setUndoState({ type: "import", snapshot: bookmarks, folders: folderEntities });
      importBookmarks(additions, folderAdditions);
    }
    if (importPreview.mergedShortcuts) {
      restoreShortcuts(importPreview.mergedShortcuts);
    }
    const added =
      importPreview.newBookmarks + importPreview.newShortcuts + folderAdditions.length;
    setImportPreview(null);
    toast(
      added > 0
        ? `Imported ${added} new item${added !== 1 ? "s" : ""}.`
        : "Already up to date — nothing new to add.",
      { variant: "success" }
    );
  };

  const handleExport = () => {
    if (bookmarks.length === 0) return;

    const html = bookmarksToNetscapeHtml(bookmarks, folderEntities);
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

    // Full-fidelity JSON — bookmarks, folder tree and shortcuts — so a backup
    // round-trips across accounts.
    const payload = buildBackupFile(backup);
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

  // Replace current bookmarks + shortcuts with a backup snapshot (local state;
  // the user can then Sync to cloud to persist). Destructive — hence confirm.
  const handleRestoreBackup = (backup: FirestoreBookmarkBackup) => {
    // With its folder tree: bookmarks alone pointed at folders that were gone.
    restoreBackup(backup.bookmarks, backup.folders);
    if (backup.shortcuts && backup.shortcuts.length > 0) {
      restoreShortcuts(backup.shortcuts);
    }
    setRestoreTarget(null);
    toast("Backup restored. Sync to cloud to keep it.", { variant: "success" });
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

  return (
    <>
        {/* Add link modal */}
        {showAddForm && (
          <Modal
            open
            onClose={() => setShowAddForm(false)}
            label="Add link"
            panelClassName="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
          >
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
            <div className="max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  placeholder="Title (optional — taken from the page)"
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
                <select
                  value={newFolderSelection}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      openNewFolderModal((folderId) => {
                        setNewFolderSelection(folderId);
                      });
                      return;
                    }
                    setNewFolderSelection(e.target.value);
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:max-w-xs"
                >
                  <option value="__unstaged__">Unstaged</option>
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                  <option value="__new__">New folder…</option>
                </select>
                <input
                  type="text"
                  placeholder="Tags (comma separated, e.g. work, dev, banking)"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <label className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={newReadLater}
                    onChange={(e) => setNewReadLater(e.target.checked)}
                    className="h-4 w-4 accent-blue-500"
                  />
                  Add to read later
                </label>
                {allTags.length > 0 && (
                  <div className="flex w-full flex-wrap gap-1.5">
                    {allTags.slice(0, 16).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendNewTag(tag)}
                        className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 transition hover:border-blue-400 hover:text-blue-200"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button"
                  onClick={handleAddQuick}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
                >
                  Save
                </button>
              </div>
            </div>
          </Modal>
        )}

        <SectionNav
          className="mb-4"
          items={[
            { id: "bsec-shortcuts", label: "Shortcuts" },
            ...(trending.length > 0
              ? [{ id: "bsec-trending", label: "Trending" }]
              : []),
            { id: "bsec-search", label: "Search" },
            { id: "bsec-folders", label: "Folders" },
          ] as SectionNavItem[]}
        />

        {/* App shortcuts */}
        <section
          id="bsec-shortcuts"
          className="mb-6 scroll-mt-20 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-sm"
        >
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
                      if (!shortcutIconValue.trim() && shortcutUrl.trim()) {
                        setShortcutIconValue(getFaviconUrl(shortcutUrl));
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
            <Modal
              open
              onClose={() => setShowAddShortcutForm(false)}
              label="Add app shortcut"
              panelClassName="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-200">Add shortcut</h2>
                <button
                  type="button"
                  onClick={() => setShowAddShortcutForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Close
                </button>
              </div>
              <div className="max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <input
                    type="text"
                    // UI-only label change; rendering already supports URLs or emoji.
                    placeholder="😀 or https://example.com/icon.png"
                    aria-label="Icon (emoji or image URL)"
                    value={shortcutIconValue}
                    onChange={(e) => {
                      setShortcutIconTouched(true);
                      setShortcutIconValue(e.target.value);
                    }}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddShortcut}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                  >
                    Save shortcut
                  </button>
                </div>
              </div>
            </Modal>
          )}
          {shortcuts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
              No shortcuts yet. Add one to jump into your favorite apps faster.
            </div>
          ) : (
            <>
              {shortcuts.length > 1 && (
                <div className="relative mb-3">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder={`Search ${shortcuts.length} shortcuts…`}
                    value={shortcutQuery}
                    onChange={(e) => setShortcutQuery(e.target.value)}
                    aria-label="Search app shortcuts"
                    className="h-10 w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-2 pl-9 pr-9 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {shortcutQuery && (
                    <button
                      type="button"
                      onClick={() => setShortcutQuery("")}
                      aria-label="Clear shortcut search"
                      className="absolute inset-y-0 right-2 flex items-center justify-center rounded-full px-2 text-slate-500 transition hover:bg-slate-800/70 hover:text-slate-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
              {filteredShortcuts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
                  No shortcuts match “{shortcutQuery.trim()}”.
                </div>
              ) : (
                <div className="bd-tile-grid w-full [--tile-gap:12px] [--tile-max:1fr] [--tile-min:108px] sm:[--tile-gap:14px] sm:[--tile-min:120px] lg:[--tile-min:132px]">
                  {filteredShortcuts.map((app) => (
                    <ShortcutIcon
                      key={app.id}
                      app={app}
                      active={activeShortcutId === app.id}
                      pinned={activeShortcutId === app.id && activeShortcutPinned}
                      onRequestHoverOpen={() => handleShortcutHoverOpen(app.id)}
                      onRequestTogglePinned={(keepOpenWhenUnpinned) =>
                        handleShortcutTogglePinned(app.id, keepOpenWhenUnpinned)
                      }
                      onRequestOpenMenu={() => handleShortcutOpenMenu(app.id)}
                      onRequestClose={() => handleShortcutRequestClose(app.id)}
                      onForceClose={handleShortcutForceClose}
                      onOpen={() => void handleShortcutOpen(app)}
                      onDelete={() => handleShortcutDelete(app.id)}
                      onEdit={() => handleStartShortcutEdit(app)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Your week — this week beside last, across the pillars */}
        <WeeklyRecapCard email={userId} bookmarks={bookmarks} />

        <MilestoneRow
          className="mb-4"
          celebrate={{ account: userId, ready: bookmarksHydrated }}
          metrics={{ bookmarks: bookmarks.length }}
        />

        {/* Read later — what you've queued to read, oldest first */}
        <ReadLaterCard bookmarks={bookmarks} onUpdate={updateBookmark} />

        {/* Rediscover — resurface one stale-but-once-loved bookmark */}
        {rediscover.bookmark && (
          <RediscoverBookmarkCard
            bookmark={rediscover.bookmark}
            onOpen={handleRediscoverOpen}
            onDismiss={rediscover.dismiss}
          />
        )}

        {/* Trending */}
        {trending.length > 0 && (
          <section
            id="bsec-trending"
            className="mb-6 scroll-mt-20 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-sm"
          >
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

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-blue-600 px-2.5 text-[10px] font-semibold text-white shadow-sm hover:bg-blue-500 sm:h-10 sm:px-4 sm:text-xs"
          >
            <span className="text-lg">＋</span>
            Add Link
          </button>
          <button
            type="button"
            onClick={() =>
              openNewFolderModal((folderId) => {
                router.push(`/folders/${encodeURIComponent(folderId)}`);
              })
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 text-[10px] font-semibold text-slate-100 shadow-sm hover:border-blue-400 hover:text-slate-50 sm:h-10 sm:px-4 sm:text-xs"
          >
            <span className="text-lg">＋</span>
            Folder
          </button>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="file"
              accept=".html,.htm,.csv,.json,text/html,text/csv,application/json"
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

          <button type="button"
            onClick={handleExport}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[10px] font-semibold text-slate-900 shadow-sm hover:bg-white sm:h-10 sm:px-4 sm:text-xs"
          >
            <span className="text-base">📤</span>
            Export
          </button>
        </div>

        {/* Search + filters */}
        <section id="bsec-search" className="mb-4 flex scroll-mt-20 flex-col gap-3">
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
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFolderFilter("");
                setTagFilter("");
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
          {tagCounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Browse by tag">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Tags</span>
              {(showAllTags || tagCounts.length <= TAGS_SHOWN
                ? tagCounts
                : tagCounts.filter((t, i) => i < TAGS_SHOWN || t.key === tagFilter)
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={tagFilter === t.key}
                  onClick={() => setTagFilter((cur) => (cur === t.key ? "" : t.key))}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                    tagFilter === t.key
                      ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {t.label} <span className="text-slate-500">{t.count}</span>
                </button>
              ))}
              {tagCounts.length > TAGS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAllTags((v) => !v)}
                  className="rounded-full px-2 py-0.5 text-xs text-blue-300 underline-offset-2 hover:underline"
                >
                  {showAllTags ? "Show fewer" : `Show all ${tagCounts.length}`}
                </button>
              )}
            </div>
          )}
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
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRestoreTarget(backup)}
                        className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBackupDownload(backup)}
                        className="inline-flex items-center justify-center rounded-full bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-slate-700"
                      >
                        Download backup
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Import preview */}
        <Modal
          open={importPreview !== null}
          onClose={() => setImportPreview(null)}
          labelledBy="import-title"
        >
          <h2
            id="import-title"
            className="text-base font-semibold text-slate-50"
          >
            Import preview
          </h2>
          {importPreview && (
            <>
              <p className="mt-1 truncate text-xs text-slate-500">
                {importPreview.source}
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                <li className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                  <span className="text-slate-300">New bookmarks</span>
                  <span className="font-semibold tabular-nums text-emerald-300">
                    +{importPreview.newBookmarks}
                  </span>
                </li>
                {importPreview.folderAdditions.length > 0 && (
                  <li className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                    <span className="text-slate-300">New folders</span>
                    <span className="font-semibold tabular-nums text-emerald-300">
                      +{importPreview.folderAdditions.length}
                    </span>
                  </li>
                )}
                {importPreview.newShortcuts > 0 && (
                  <li className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                    <span className="text-slate-300">New shortcuts</span>
                    <span className="font-semibold tabular-nums text-emerald-300">
                      +{importPreview.newShortcuts}
                    </span>
                  </li>
                )}
                <li className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2">
                  <span className="text-slate-300">
                    Duplicates (skipped)
                  </span>
                  <span className="font-semibold tabular-nums text-slate-400">
                    {importPreview.duplicateBookmarks}
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Your existing bookmarks are kept — only new URLs are added.
              </p>
            </>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setImportPreview(null)}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyImport}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Import
            </button>
          </div>
        </Modal>

        {/* Restore-backup confirm */}
        <Modal
          open={restoreTarget !== null}
          onClose={() => setRestoreTarget(null)}
          labelledBy="restore-title"
        >
          <h2
            id="restore-title"
            className="text-base font-semibold text-slate-50"
          >
            Restore this backup?
          </h2>
          {restoreTarget && (
            <p className="mt-3 text-sm text-slate-300">
              This replaces your current bookmarks and shortcuts with the
              snapshot from{" "}
              <span className="font-medium text-slate-100">
                {formatBackupDate(restoreTarget.createdAt)}
              </span>{" "}
              ({restoreTarget.bookmarks.length} bookmark
              {restoreTarget.bookmarks.length !== 1 ? "s" : ""}).
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Nothing is saved to the cloud until you Sync to cloud afterwards.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setRestoreTarget(null)}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => restoreTarget && handleRestoreBackup(restoreTarget)}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Restore
            </button>
          </div>
        </Modal>

        <StarterPicker
          open={starterOpen}
          onClose={() => setStarterOpen(false)}
          onAdd={handleStarterLinks}
          title="Start with a few links"
          intro="Pick the sites you already use — each lands in a folder for its kind. Rename, move or delete them anytime."
          noun={["link", "links"]}
          sections={STARTER_GROUPS.map((g) => ({
            name: g.name,
            emoji: g.emoji,
            items: g.links.map((l) => ({
              key: l.url,
              label: l.title,
              hint: new URL(l.url).hostname.replace(/^www\./, ""),
            })),
          }))}
        />

        {/* Folders (wallet view) */}
        {bookmarks.length === 0 && rootFolders.length === 0 ? (
          <div
            id="bsec-folders"
            className="mt-10 scroll-mt-20 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-400"
          >
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
                    accept=".html,.htm,.csv,.json,text/html,text/csv,application/json"
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
              <button
                type="button"
                onClick={() => setStarterOpen(true)}
                className="text-xs font-medium text-blue-300 underline-offset-2 hover:underline"
              >
                Or start with a few popular sites
              </button>
            </div>
          </div>
        ) : (
          <div id="bsec-folders" className="scroll-mt-20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Folders
                </h2>
                <p className="text-xs text-slate-500">
                  Group bookmarks into wallet-style folders.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/folders/manage"
                  className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-slate-50"
                >
                  Manage
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (folderSelectMode) {
                      clearFolderSelection();
                      return;
                    }
                    setFolderSelectMode(true);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-slate-50"
                >
                  {folderSelectMode ? "Done" : "Select"}
                </button>
              </div>
            </div>
            {folderSelectMode && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3">
                <span className="text-xs text-slate-300">
                  {selectedFolderKeys.length} folder
                  {selectedFolderKeys.length !== 1 ? "s" : ""} selected
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFolderKeys.length === 0) return;
                    setShowBulkDeleteFoldersConfirm(true);
                  }}
                  disabled={selectedFolderKeys.length === 0}
                  className="rounded-full border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-900/60 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete folders
                </button>
                <button
                  type="button"
                  onClick={clearFolderSelection}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(!search || folderBuckets.unstaged.length > 0) && (
              <FolderCard
                name="Unstaged"
                count={folderBuckets.unstaged.length}
                subfolderCount={0}
                previews={folderBuckets.unstaged}
                isUnstaged
                isEmpty={folderBuckets.unstaged.length === 0}
                selectMode={folderSelectMode}
                isSelectable={false}
                isSelected={false}
                onOpen={() => {
                  router.push("/folders/unstaged");
                }}
              />
            )}
            {rootFolders.map((folder) => {
              const items = folderBuckets.byKey.get(folder.id) ?? [];
              if (search && items.length === 0) {
                return null;
              }
              return (
                <FolderCard
                  key={folder.id}
                  name={folder.name}
                  query={search}
                  count={items.length}
                  subfolderCount={childrenByParentId.get(folder.id)?.length ?? 0}
                  previews={items}
                  childFolders={childPreviewByParentId.get(folder.id)}
                  hasChildren={parentIdsWithChildren.has(folder.id)}
                  isEmpty={items.length === 0}
                  selectMode={folderSelectMode}
                  isSelected={selectedFolderKeys.includes(folder.id)}
                  isSelectable
                  onToggleSelect={() => toggleFolderSelection(folder.id)}
                  onOpen={() => {
                    router.push(`/folders/${encodeURIComponent(folder.id)}`);
                  }}
                />
              );
            })}
            </div>
          </div>
        )}
        {/* Shortcut edit modal */}
        {editingShortcut && (
          <Modal
            open
            onClose={handleCancelShortcutEdit}
            label="Edit shortcut"
            panelClassName="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
          >
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
                className={FIELD_CLASS}
              />
              <input
                type="text"
                placeholder="https://app.example.com"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className={FIELD_CLASS}
              />
              <input
                type="text"
                // UI-only label change; rendering already supports URLs or emoji.
                placeholder="😀 or https://example.com/icon.png"
                aria-label="Icon (emoji or image URL)"
                value={editIconValue}
                onChange={(e) => {
                  setEditIconTouched(true);
                  setEditIconValue(e.target.value);
                }}
                className={FIELD_CLASS}
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
          </Modal>
        )}
        {/* Undo bar */}
        {shortcutUndoState && (
          <div
            className={`fixed inset-x-0 ${
              undoState ? "bottom-16" : "bottom-4"
            } z-50 flex justify-center px-4`}
          >
            <div className="animate-bd-slide-up-fade flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2 text-xs text-slate-100 shadow-lg ring-1 ring-slate-700">
              <span>Shortcut removed</span>
              <button type="button"
                onClick={handleShortcutUndo}
                className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-50"
              >
                Undo
              </button>
              <button type="button"
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
            <div className="animate-bd-slide-up-fade flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2 text-xs text-slate-100 shadow-lg ring-1 ring-slate-700">
              <span>
                {undoState.type === "delete"
                  ? "Bookmark deleted"
                  : undoState.type === "bulkDelete"
                    ? "Bookmarks deleted"
                  : undoState.type === "import"
                    ? "Bookmarks imported"
                  : "All bookmarks cleared"}
              </span>
              <button type="button"
                onClick={handleUndo}
                className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-50"
              >
                Undo
              </button>
              <button type="button"
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
          <Modal
            open
            onClose={() => setShowClearConfirm(false)}
            label="Delete all bookmarks"
            panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl outline-none"
          >
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
          </Modal>
        )}
        {showBulkDeleteFoldersConfirm && (
          <Modal
            open
            onClose={() => setShowBulkDeleteFoldersConfirm(false)}
            label="Delete folders"
            panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl outline-none"
          >
            <h2 className="mb-2 text-base font-semibold text-slate-50">
              Delete {selectedFolderKeys.length} folders?
            </h2>
            <p className="mb-4 text-xs text-slate-400">
              Bookmarks will be moved to Unstaged.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteFoldersConfirm(false)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBulkDeleteFolders}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
              >
                Delete folders
              </button>
            </div>
          </Modal>
        )}
        {showBulkMoveBookmarksModal && (
          <Modal
            open
            onClose={() => setShowBulkMoveBookmarksModal(false)}
            label="Move bookmarks"
            panelClassName="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
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
                className={FIELD_CLASS}
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
                onClick={applyBulkMoveBookmarks}
                disabled={selectedBookmarkIds.length === 0}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </Modal>
        )}
        {showBulkDeleteBookmarksConfirm && (
          <Modal
            open
            onClose={() => setShowBulkDeleteBookmarksConfirm(false)}
            label="Delete bookmarks"
            panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl outline-none"
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
                onClick={applyBulkDeleteBookmarks}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </Modal>
        )}
        {activeFolderKey && (
          <Modal
            open
            onClose={() => setActiveFolderKey(null)}
            label={`${activeFolderLabel} folder`}
            panelClassName="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                  Folder
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {activeFolderLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeFolderKey !== "UNSTAGED" && (
                  <>
                    <button
                      type="button"
                      onClick={openRenameForActiveFolder}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-blue-400 hover:text-slate-50"
                      aria-label="Rename folder"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={openDeleteForActiveFolder}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-base text-slate-300 transition hover:border-red-400 hover:bg-red-900/60 hover:text-slate-50"
                      aria-label="Delete folder"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (bookmarkSelectMode) {
                      clearBookmarkSelection();
                      return;
                    }
                    setBookmarkSelectMode(true);
                    setSelectedBookmarkIds([]);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-slate-50"
                >
                  {bookmarkSelectMode ? "Done" : "Select"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetFolderId =
                      activeFolderKey === "UNSTAGED" ? null : activeFolderKey;
                    setActiveFolderKey(null);
                    handleAddLinkForFolder(targetFolderId);
                  }}
                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  + Add Link
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFolderKey(null)}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-y-auto pr-1">
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
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="rounded-full border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-900/60 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={selectAllBookmarksInActiveFolder}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedBookmarks}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={clearBookmarkSelection}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {activeFolderItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
                  <p className="text-slate-200">No bookmarks in this folder yet.</p>
                  <p className="mt-2 text-xs text-slate-400">
                    Assign a bookmark to this folder from the edit menu.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const targetFolderId =
                        activeFolderKey === "UNSTAGED" ? null : activeFolderKey;
                      setActiveFolderKey(null);
                      handleAddLinkForFolder(targetFolderId);
                    }}
                    className="mt-4 inline-flex items-center rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
                  >
                    + Add Link to this folder
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedActiveFolderItems.map(([tag, tagItems]) => (
                    <section
                      key={tag}
                      aria-label={`Bookmarks tagged ${tag}`}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                          {tag}
                        </h3>
                        <span className="text-xs text-slate-500">
                          {tagItems.length} item{tagItems.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                        {tagItems.map((b) => (
                          <BookmarkCard
                            key={`${tag}-${b.id}`}
                            bookmark={b}
                            query={search}
                            folderOptions={folderOptions}
                            folderName={
                              typeof b.folderId === "string"
                                ? findFolderById(b.folderId)?.name
                                : undefined
                            }
                            onRequestNewFolder={(onCreated) => {
                              openNewFolderModal((folderId) => {
                                onCreated(folderId);
                              });
                            }}
                            onUpdate={updateBookmark}
                            onDelete={handleDelete}
                            selectMode={bookmarkSelectMode}
                            isSelected={selectedBookmarkIds.includes(b.id)}
                            onToggleSelect={toggleBookmarkSelection}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        )}
        {showRenameFolderModal && (
          <Modal
            open
            onClose={() => {
              setShowRenameFolderModal(false);
              setRenameFolderError("");
            }}
            label="Rename folder"
            panelClassName="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Rename folder</h3>
              <button
                type="button"
                onClick={() => {
                  setShowRenameFolderModal(false);
                  setRenameFolderError("");
                }}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Folder name"
                value={renameFolderInput}
                onChange={(e) => {
                  setRenameFolderInput(e.target.value);
                  if (renameFolderError) {
                    setRenameFolderError("");
                  }
                }}
                maxLength={MAX_FOLDER_NAME}
                className={FIELD_CLASS}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    renameFolder(activeFolderLabel, renameFolderInput);
                  }
                }}
              />
              {renameFolderError && (
                <p className="text-xs text-red-400">{renameFolderError}</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRenameFolderModal(false);
                  setRenameFolderError("");
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => renameFolder(activeFolderLabel, renameFolderInput)}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Save
              </button>
            </div>
          </Modal>
        )}
        {showDeleteFolderConfirm && (
          <Modal
            open
            onClose={() => setShowDeleteFolderConfirm(false)}
            label="Delete folder"
            panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100 shadow-xl outline-none"
          >
            <h2 className="mb-2 text-base font-semibold text-slate-50">
              Delete folder?
            </h2>
            <p className="mb-4 text-xs text-slate-400">bookmarks moved to Unstaged</p>
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
                onClick={() => {
                  if (!activeFolderKey || activeFolderKey === "UNSTAGED") return;
                  deleteFolder(activeFolderKey);
                }}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </Modal>
        )}
        {showNewFolderModal && (
          <Modal
            open
            onClose={() => {
              setShowNewFolderModal(false);
              setNewFolderError("");
            }}
            label="New folder"
            panelClassName="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl ring-1 ring-white/5 outline-none"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">New folder</h3>
              <button
                type="button"
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderError("");
                }}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Folder name (e.g. Medical, Work)"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  if (newFolderError) {
                    setNewFolderError("");
                  }
                }}
                className={FIELD_CLASS}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const folderId = addRootFolder(newFolderName);
                    if (!folderId) return;
                    newFolderRequestRef.current?.(folderId);
                    setShowNewFolderModal(false);
                    setNewFolderError("");
                  }
                }}
              />
              {newFolderError && (
                <p className="text-xs text-red-400">{newFolderError}</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderError("");
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const folderId = addRootFolder(newFolderName);
                  if (!folderId) return;
                  newFolderRequestRef.current?.(folderId);
                  setShowNewFolderModal(false);
                  setNewFolderError("");
                }}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Create
              </button>
            </div>
          </Modal>
        )}
    </>
  );
}

export default HomePageClient;
