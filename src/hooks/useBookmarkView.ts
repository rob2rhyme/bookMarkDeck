"use client";

// Bookmark grid density — "comfortable" (roomy cards) or "compact" (more per
// screen), à la Raindrop's view modes. Local-only per device, hydration-safe:
// starts at the default on the server/first paint, then reads localStorage in
// an effect so SSR and the first client render match.

import { useEffect, useState } from "react";

export type BookmarkView = "comfortable" | "compact";

const KEY = "bd:bookmark-view:v1";

export function bookmarkGridClass(view: BookmarkView): string {
  return view === "compact"
    ? "grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3";
}

export function useBookmarkView() {
  const [view, setView] = useState<BookmarkView>("comfortable");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "compact" || raw === "comfortable") setView(raw);
    } catch {}
    setHydrated(true);
  }, []);

  const update = (next: BookmarkView) => {
    setView(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {}
  };

  return { view, setView: update, hydrated };
}
