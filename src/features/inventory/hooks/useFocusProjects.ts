"use client";

import { useEffect, useState } from "react";

import { distinctProjects } from "@/features/inventory/lib/focusProjects";

// The focus pillar's per-user to-do cache (see features/focus/hooks/useTodos.ts).
// Read here strictly READ-ONLY — same pattern as useBookmarkLibrary — so an item
// can link to a Focus project without the inventory feature touching focus data.
const FOCUS_TODOS_KEY = "bookmarkdeck:focus:todos:v1";

function readProjects(email?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const key = email ? `${FOCUS_TODOS_KEY}:${email}` : FOCUS_TODOS_KEY;
    const raw = window.localStorage.getItem(key);
    return raw ? distinctProjects(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** The user's Focus project labels, pickable read-only — loaded after mount
 *  (hydration-safe). Empty when the focus pillar is absent/unused. */
export function useFocusProjects(email?: string | null): string[] {
  const [projects, setProjects] = useState<string[]>([]);
  useEffect(() => {
    setProjects(readProjects(email));
  }, [email]);
  return projects;
}
