// Cross-feature handoff: bookmarks → focus → a record of progress. When you
// start a focus session from a bookmark, we stash a lightweight link (id +
// title + time + day) in localStorage. The home page reconciles it against
// focus sessions: if a block was *completed* today after the link, it logs a
// "bookmark" activity event. Decoupled — neither feature imports the other;
// both meet only at this neutral lib (mirrors focusIntent.ts and habits'
// focusLink.ts). The title is stored so the summary survives a later edit/delete
// of the bookmark.

import { todayKey } from "@/lib/dayKey"; // the same local day focus stores as session.day

const KEY = "bd:bookmark-focus-link:v1";

export type BookmarkFocusLink = {
  bookmarkId: string;
  title: string;
  at: string; // ISO timestamp of launch
  day: string; // local YYYY-MM-DD of launch
};

export function setBookmarkFocusLink(bookmarkId: string, title: string): void {
  if (typeof window === "undefined") return;
  try {
    const link: BookmarkFocusLink = {
      bookmarkId,
      title,
      at: new Date().toISOString(),
      day: todayKey(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    /* ignore */
  }
}

export function peekBookmarkFocusLink(): BookmarkFocusLink | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.bookmarkId !== "string" || typeof v.at !== "string") {
      return null;
    }
    return {
      bookmarkId: v.bookmarkId,
      title: typeof v.title === "string" ? v.title : "",
      at: v.at,
      day: typeof v.day === "string" ? v.day : "",
    };
  } catch {
    return null;
  }
}

export function clearBookmarkFocusLink(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Pure: the bookmark a focus block completing on `day` should be attributed to,
 * or null. A link only attributes blocks completed on the same day it was set —
 * never a stale link from an earlier day.
 */
export function bookmarkForDay(
  link: BookmarkFocusLink | null,
  day: string
): { id: string; title: string } | null {
  if (!link || link.day !== day) return null;
  return { id: link.bookmarkId, title: link.title };
}
