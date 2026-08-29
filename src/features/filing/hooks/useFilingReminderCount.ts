"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// These three libs are pure — they import only types and each other — so this
// adds nothing firebase-shaped to the shared shell's bundle.
import { overdueBackCount } from "@/features/filing/lib/custody";
import { addDays } from "@/features/filing/lib/obligations";
import { shredItems } from "@/features/filing/lib/retention";
import type { FilingDocument, FilingFolder } from "@/features/filing/lib/types";

// Must match the cache keys useFilingDocuments / useFilingFolders write.
const DOCUMENTS_KEY = "bookmarkdeck:filing:documents:v1";
const FOLDERS_KEY = "bookmarkdeck:filing:folders:v1";
const SETTINGS_KEY = "bookmarkdeck:filing:settings:v1";
const DEFAULT_LEAD_DAYS = 30;

/**
 * Local YYYY-MM-DD, inlined rather than imported so the shared shell never
 * pulls the firebase-heavy data module into its bundle — the same constraint
 * useInventoryReminderCount follows.
 */
function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function leadDaysFor(email?: string | null): number {
  if (typeof window === "undefined") return DEFAULT_LEAD_DAYS;
  try {
    const raw = window.localStorage.getItem(
      email ? `${SETTINGS_KEY}:${email}` : SETTINGS_KEY
    );
    const parsed = raw ? JSON.parse(raw) : null;
    const lead = parsed?.leadDays;
    return typeof lead === "number" && lead >= 0 ? lead : DEFAULT_LEAD_DAYS;
  } catch {
    return DEFAULT_LEAD_DAYS;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Count from the caches alone (ANALYSIS-FILING-LOG.md §7). Three things want
 * attention, and the badge is the sum:
 *
 *  1. an obligation due — read straight off the slim `nextDueOn`, which is in
 *     the projection precisely so this works without the obligation arrays;
 *  2. a paper whose retention has run out — computed from the slim retention
 *     inputs against the folders cache, which is stored whole;
 *  3. a folder somebody has had for longer than they said.
 *
 * Counted per document / per folder, so one paper with three overdue
 * obligations is one number, not three.
 */
function readCount(email?: string | null): number {
  if (typeof window === "undefined" || !email) return 0;
  try {
    const documents = readArray<FilingDocument>(`${DOCUMENTS_KEY}:${email}`);
    const folders = readArray<FilingFolder>(`${FOLDERS_KEY}:${email}`);
    const today = todayLocal();
    const lead = leadDaysFor(email);
    const cutoff = addDays(today, lead);

    const due = documents.filter(
      (d) => !d.archived && typeof d.nextDueOn === "string" && d.nextDueOn <= cutoff
    ).length;
    const shred = shredItems(documents, folders, today, lead).length;
    const late = overdueBackCount(folders, today);

    return due + shred + late;
  } catch {
    return 0;
  }
}

/**
 * How many things need doing something about — renewals and payments due,
 * papers ready to shred, folders somebody hasn't brought back — for the
 * "Filing" nav badge. Reads the per-user localStorage cache
 * (hydration-safe: starts at 0, fills after mount), so it's a cross-page hint;
 * the /filing Upcoming panel is the live source. Re-reads on navigation, tab
 * focus, and cross-tab storage writes.
 */
export function useFilingReminderCount(email?: string | null): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(readCount(email));
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key.startsWith(DOCUMENTS_KEY) ||
        e.key.startsWith(FOLDERS_KEY) ||
        e.key.startsWith(SETTINGS_KEY)
      ) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [email, pathname]);

  return count;
}
