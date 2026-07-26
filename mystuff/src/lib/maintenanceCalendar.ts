// A calm, forward-looking timeline of upkeep dates — warranty expirations and
// maintenance/service dates — grouped by month. The Attention panel handles the
// urgent window (≤30 days / overdue); this is the wider "what's coming" view.
// Pure + deterministic: `today` is always passed as YYYY-MM-DD (see the test).

import type { InventoryItem } from "@/lib/types";
import { daysUntil } from "@/lib/value";

export type UpkeepKind = "warranty" | "maintenance";

export type UpkeepEntry = {
  id: string; // `${item.id}:${kind}` — stable list key
  item: InventoryItem;
  kind: UpkeepKind;
  date: string; // YYYY-MM-DD
  days: number; // daysUntil(date, today) — negative = overdue/past
};

export type UpkeepBucket = {
  key: string; // "overdue" | "YYYY-MM"
  label: string; // "Overdue" | "This month" | "Next month" | "August 2026"
  entries: UpkeepEntry[];
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ymOf = (date: string) => date.slice(0, 7); // "YYYY-MM"

function nextYm(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function monthLabel(ym: string, todayYm: string): string {
  if (ym === todayYm) return "This month";
  if (ym === nextYm(todayYm)) return "Next month";
  const y = ym.slice(0, 4);
  const m = Number(ym.slice(5, 7));
  return `${MONTHS[m - 1]} ${y}`;
}

const live = (items: InventoryItem[]) => items.filter((i) => !i.archived);

/**
 * Build the upkeep entries for the timeline: every maintenance date (overdue +
 * upcoming, since upkeep still needs doing) and every *upcoming* warranty
 * expiry (already-expired warranties are history — the Attention panel owns
 * those). Sorted chronologically, earliest first.
 */
export function upkeepEntries(items: InventoryItem[], today: string): UpkeepEntry[] {
  const out: UpkeepEntry[] = [];
  for (const item of live(items)) {
    if (item.maintenanceDate) {
      const days = daysUntil(item.maintenanceDate, today);
      if (days !== null) {
        out.push({ id: `${item.id}:maintenance`, item, kind: "maintenance", date: item.maintenanceDate, days });
      }
    }
    if (item.warrantyExpiry) {
      const days = daysUntil(item.warrantyExpiry, today);
      if (days !== null && days >= 0) {
        out.push({ id: `${item.id}:warranty`, item, kind: "warranty", date: item.warrantyExpiry, days });
      }
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.item.name.localeCompare(b.item.name)
  );
}

/**
 * Group the upkeep entries into buckets: an "Overdue" bucket first (past
 * maintenance), then one bucket per calendar month that has an entry, in
 * chronological order. Empty when nothing is dated.
 */
export function upkeepTimeline(items: InventoryItem[], today: string): UpkeepBucket[] {
  const entries = upkeepEntries(items, today);
  const todayYm = ymOf(today);
  const buckets: UpkeepBucket[] = [];
  const byKey = new Map<string, UpkeepBucket>();

  for (const e of entries) {
    const key = e.days < 0 ? "overdue" : ymOf(e.date);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, label: key === "overdue" ? "Overdue" : monthLabel(key, todayYm), entries: [] };
      byKey.set(key, bucket);
      buckets.push(bucket); // entries are pre-sorted, so bucket order is correct
    }
    bucket.entries.push(e);
  }
  return buckets;
}

/** How many upkeep dates the timeline is tracking (for the header badge). */
export function upkeepCount(items: InventoryItem[], today: string): number {
  return upkeepEntries(items, today).length;
}

/** "Jul 28" style short date from a YYYY-MM-DD string. */
export function shortDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** A soft, human relative hint for a day delta (negative = past). */
export function relativeWhen(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day ago";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}
