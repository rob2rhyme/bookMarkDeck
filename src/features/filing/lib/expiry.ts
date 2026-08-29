// When a document stops being valid — as distinct from when a bill is due.
//
// Phase 3 could already track a passport's renewal date, but it sat in "Coming
// up" alongside the electricity bill, and an expiring passport is not the same
// kind of fact as an unpaid invoice: you cannot pay it late, the consequence is
// being turned away at a desk, and the lead time is months rather than days.
// This module is the lens that separates them.
//
// Pure — see expiry.test.ts.

import { daysBetween, isDate, type Bucket } from "@/features/filing/lib/obligations";
import type {
  FilingDocument,
  FilingFolder,
  Obligation,
} from "@/features/filing/lib/types";

/**
 * Kinds that mean "the document lapses on this date". `pay` and `file` are
 * obligations you discharge; these two end a document's validity.
 */
const VALIDITY_KINDS = new Set(["expires", "renew"]);

export type ExpiryStatus = "expired" | "critical" | "soon" | "ok";

export const EXPIRY_STATUS_LABELS: Record<ExpiryStatus, string> = {
  expired: "Expired",
  critical: "Expiring now",
  soon: "Expiring soon",
  ok: "Valid",
};

/**
 * How many days out each band starts. Generous by design: a passport renewal
 * can take months, so "soon" is half a year rather than a fortnight.
 */
export const CRITICAL_DAYS = 30;
export const SOON_DAYS = 180;

export function statusFor(daysLeft: number): ExpiryStatus {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= CRITICAL_DAYS) return "critical";
  if (daysLeft <= SOON_DAYS) return "soon";
  return "ok";
}

/**
 * Months of validity many countries demand beyond your date of entry.
 *
 * 70-odd countries apply a six-month rule, the Schengen area asks three, and
 * some want only validity on the day you land. Six is the safe assumption and
 * the one that stops you being denied boarding — but it is a DEFAULT, not a
 * guarantee, and the UI says to check the destination.
 */
export const TRAVEL_VALIDITY_MONTHS = 6;

/** Preset ids whose expiry carries the travel-validity rule. */
const TRAVEL_DOCUMENT_PRESETS = new Set(["passport"]);

export type ExpiryItem = {
  document: FilingDocument;
  obligation: Obligation;
  folder: FilingFolder | null;
  expiresOn: string;
  /** Negative once it has lapsed. */
  daysLeft: number;
  status: ExpiryStatus;
  /**
   * For a passport: the date it stops satisfying a six-month rule — which is
   * the date that actually matters, and is half a year before the one printed
   * on the document.
   */
  travelCutoff: string | null;
  /** False once the six-month window has already closed. */
  travelValid: boolean | null;
};

/** Six months before expiry, clamped like every other date in this feature. */
export function travelCutoffFor(expiresOn: string): string {
  const [y, m, d] = expiresOn.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - TRAVEL_VALIDITY_MONTHS, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const isOpenValidity = (o: Obligation): boolean => {
  if (o.archived) return false;
  if (!VALIDITY_KINDS.has(o.kind)) return false;
  return isDate(o.dueOn);
};

/**
 * Every validity date worth showing, soonest first.
 *
 * Unlike the reminders panel this does NOT filter by lead time: the whole point
 * is to see what you hold and when each piece lapses, including the passport
 * that is fine for another four years.
 */
export function expiryItems(
  documents: FilingDocument[],
  folders: FilingFolder[],
  today: string
): ExpiryItem[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: ExpiryItem[] = [];

  for (const document of documents) {
    if (document.archived) continue;
    for (const obligation of document.obligations ?? []) {
      if (!isOpenValidity(obligation)) continue;
      const daysLeft = daysBetween(today, obligation.dueOn);
      const travels = TRAVEL_DOCUMENT_PRESETS.has(obligation.presetId ?? "");
      const travelCutoff = travels ? travelCutoffFor(obligation.dueOn) : null;
      out.push({
        document,
        obligation,
        folder: (document.folderId && byId.get(document.folderId)) || null,
        expiresOn: obligation.dueOn,
        daysLeft,
        status: statusFor(daysLeft),
        travelCutoff,
        travelValid: travelCutoff ? daysBetween(today, travelCutoff) >= 0 : null,
      });
    }
  }

  return out.sort(
    (a, b) =>
      a.expiresOn.localeCompare(b.expiresOn) ||
      a.document.title.localeCompare(b.document.title)
  );
}

/** Group for the panel, dropping empty bands. */
export function groupByStatus(items: ExpiryItem[]): [ExpiryStatus, ExpiryItem[]][] {
  const order: ExpiryStatus[] = ["expired", "critical", "soon", "ok"];
  return order
    .map((s) => [s, items.filter((i) => i.status === s)] as [ExpiryStatus, ExpiryItem[]])
    .filter(([, list]) => list.length > 0);
}

/** How many need attention — expired or inside the critical window. */
export function expiringCount(items: ExpiryItem[]): number {
  return items.filter((i) => i.status === "expired" || i.status === "critical").length;
}

/** Bucket in the reminders panel's own vocabulary, for shared surfaces. */
export function bucketForExpiry(daysLeft: number): Bucket {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 7) return "week";
  if (daysLeft <= 31) return "month";
  return "later";
}
