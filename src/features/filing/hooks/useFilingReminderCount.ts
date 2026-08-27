"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// lib/obligations is pure (it imports only types), so this adds nothing
// firebase-shaped to the shared shell's bundle.
import { addDays } from "@/features/filing/lib/obligations";

// Must match the slim cache key useFilingDocuments writes.
const DOCUMENTS_KEY = "bookmarkdeck:filing:documents:v1";
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

/**
 * Count from the SLIM cache alone (ANALYSIS-FILING-LOG.md §7): each record
 * carries only `nextDueOn`, not its obligations, which is exactly why that field
 * is in the projection. Anything due within the lead window — or already
 * overdue — counts once, per document.
 */
function readCount(email?: string | null): number {
  if (typeof window === "undefined" || !email) return 0;
  try {
    const raw = window.localStorage.getItem(`${DOCUMENTS_KEY}:${email}`);
    const docs = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(docs)) return 0;
    const today = todayLocal();
    const lead = leadDaysFor(email);
    const cutoff = addDays(today, lead);
    return docs.filter(
      (d: { nextDueOn?: string | null; archived?: boolean }) =>
        !d.archived && typeof d.nextDueOn === "string" && d.nextDueOn <= cutoff
    ).length;
  } catch {
    return 0;
  }
}

/**
 * How many papers need doing something about — renewals, payments, filings —
 * for the "Filing" nav badge. Reads the per-user localStorage cache
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
      if (!e.key || e.key.startsWith(DOCUMENTS_KEY) || e.key.startsWith(SETTINGS_KEY)) {
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
