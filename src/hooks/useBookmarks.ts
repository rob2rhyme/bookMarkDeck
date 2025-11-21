//src/hooks/useBookmarks.ts
"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "@/types/bookmark";

const STORAGE_KEY = "bookmarkdeck:v1";

function normalizeBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any): Bookmark => ({
    id: item.id ?? crypto.randomUUID(),
    title: item.title ?? item.url ?? "Untitled",
    url: item.url ?? "",
    note: item.note ?? "",
    folder: item.folder,
    createdAt: item.createdAt ?? new Date().toISOString(),
    tags: Array.isArray(item.tags)
      ? item.tags.map((t: any) => String(t)).filter(Boolean)
      : [],
  }));
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
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    setBookmarks(loadFromStorage());
  }, []);

  useEffect(() => {
    if (bookmarks.length >= 0) {
      saveToStorage(bookmarks);
    }
  }, [bookmarks]);

  const addBookmark = (partial: AddBookmarkInput) => {
    const newBookmark: Bookmark = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      tags: partial.tags ?? [],
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
    setBookmarks(normalizeBookmarks(snapshot));
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
