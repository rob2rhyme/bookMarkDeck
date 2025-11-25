//src/hooks/useBookmarks.ts
"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "@/types/bookmark";

const STORAGE_KEY = "bookmarkdeck:v1";

function normalizeBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object"
    )
    .map((item): Bookmark => {
      const tags = Array.isArray(item.tags)
        ? item.tags.map((tag) => String(tag)).filter(Boolean)
        : [];

      return {
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        title:
          (typeof item.title === "string" && item.title) ||
          (typeof item.url === "string" && item.url) ||
          "Untitled",
        url: typeof item.url === "string" ? item.url : "",
        note: typeof item.note === "string" ? item.note : "",
        folder: typeof item.folder === "string" ? item.folder : undefined,
        createdAt:
          typeof item.createdAt === "string"
            ? item.createdAt
            : new Date().toISOString(),
        tags,
        pinned: typeof item.pinned === "boolean" ? item.pinned : false,
      };
    });
}

function loadFromStorage(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeBookmarks(parsed);
  } catch {
    return [];
  }
}

function saveToStorage(bookmarks: Bookmark[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

type AddBookmarkInput = Omit<Bookmark, "id" | "createdAt">;

export function useBookmarks() {
  // Start empty on the server and hydrate from localStorage client-side to avoid
  // SSR/client mismatches.
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadFromStorage();
    // Loading from localStorage happens once on the client; safe to set state here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBookmarks(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(bookmarks);
  }, [bookmarks, hydrated]);

  const addBookmark = (partial: AddBookmarkInput) => {
    const newBookmark: Bookmark = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      tags: partial.tags ?? [],
      pinned: partial.pinned ?? false,
    };
    setBookmarks((prev) => [newBookmark, ...prev]);
  };

  const updateBookmark = (id: string, data: Partial<Bookmark>) => {
    setBookmarks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              ...data,
              tags: data.tags
                ? data.tags.map((t) => t.trim()).filter(Boolean)
                : b.tags,
                pinned:
                typeof data.pinned === "boolean" ? data.pinned : b.pinned,
            }
          : b
      )
    );
  };

  const deleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const clearAll = () => {
    setBookmarks([]);
  };
  
  // Restore an exact previous list of bookmarks (used for Undo)
  const restoreFromSnapshot = (snapshot: Bookmark[]) => {
    setBookmarks(
      normalizeBookmarks(
        snapshot.map((b) => ({
          ...b,
          pinned: typeof b.pinned === "boolean" ? b.pinned : false,
        }))
      )
    );
  };

  return {
    bookmarks,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    clearAll,
    restoreFromSnapshot,
  };
}
