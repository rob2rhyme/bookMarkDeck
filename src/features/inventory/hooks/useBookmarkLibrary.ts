"use client";

import { useEffect, useState } from "react";

import type { ItemLink } from "@/features/inventory/lib/types";

// The bookmarks pillar's per-user localStorage cache (see useBookmarks.ts).
// Read here strictly READ-ONLY — same pattern as CommandPalette — so items can
// link to bookmarks without the inventory feature ever touching bookmark data.
const BOOKMARKS_KEY = "bookmarkdeck:v2";

function readLibrary(email?: string | null): ItemLink[] {
  if (typeof window === "undefined") return [];
  try {
    const key = email ? `${BOOKMARKS_KEY}:${email}` : BOOKMARKS_KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [];
    const seen = new Set<string>();
    const out: ItemLink[] = [];
    for (const b of list) {
      if (typeof b?.url !== "string" || !b.url || seen.has(b.url)) continue;
      seen.add(b.url);
      out.push({
        id: typeof b.id === "string" ? b.id : b.url,
        title: typeof b.title === "string" && b.title ? b.title : b.url,
        url: b.url,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** The user's bookmark library as pickable links — loaded after mount
 *  (hydration-safe), read-only. */
export function useBookmarkLibrary(email?: string | null): ItemLink[] {
  const [library, setLibrary] = useState<ItemLink[]>([]);
  useEffect(() => {
    setLibrary(readLibrary(email));
  }, [email]);
  return library;
}
