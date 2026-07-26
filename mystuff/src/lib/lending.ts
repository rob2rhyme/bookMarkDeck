// Pure lending-ledger helpers for the inventory pillar: who has your stuff and
// when it's due back, derived entirely from fields already on the item
// (lentTo / lentDate / dueDate). No React/Firebase — see lending.test.ts.
// `today` is always passed in as a YYYY-MM-DD string; never read the clock here.

import { daysUntil } from "@/lib/value";
import type { InventoryItem } from "@/lib/types";

export type LendStatus = "overdue" | "due-soon" | "on-loan" | "no-due";

export type LendEntry = {
  item: InventoryItem;
  status: LendStatus;
  /** Days until the return is due (negative = overdue); null when no due date. */
  daysUntilDue: number | null;
  /** Days the item has been out (since lentDate); null when no lent date. */
  heldDays: number | null;
};

/** A due date this many days out (or fewer) counts as "due soon". */
export const LEND_SOON_DAYS = 7;

function lendStatus(daysUntilDue: number | null): LendStatus {
  if (daysUntilDue === null) return "no-due";
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= LEND_SOON_DAYS) return "due-soon";
  return "on-loan";
}

/**
 * Every active item currently lent out, most-urgent first: overdue (soonest
 * gone-over first) → upcoming due dates → open-ended loans (longest held
 * first). Purely a view over stored fields — nothing new is persisted.
 */
export function lendingLedger(items: InventoryItem[], today: string): LendEntry[] {
  const entries: LendEntry[] = [];
  for (const item of items) {
    if (item.archived) continue;
    if (!item.lentTo?.trim()) continue;
    const daysUntilDue = item.dueDate ? daysUntil(item.dueDate, today) : null;
    const sinceLent = item.lentDate ? daysUntil(item.lentDate, today) : null;
    entries.push({
      item,
      status: lendStatus(daysUntilDue),
      daysUntilDue,
      heldDays: sinceLent === null ? null : -sinceLent,
    });
  }
  return entries.sort((a, b) => {
    const aHas = a.daysUntilDue !== null;
    const bHas = b.daysUntilDue !== null;
    if (aHas && bHas) {
      return (
        a.daysUntilDue! - b.daysUntilDue! ||
        a.item.name.localeCompare(b.item.name)
      );
    }
    if (aHas !== bHas) return aHas ? -1 : 1; // due-dated before open-ended
    return (
      (b.heldDays ?? 0) - (a.heldDays ?? 0) ||
      a.item.name.localeCompare(b.item.name)
    );
  });
}

/** How many active items are lent out — for the header badge. */
export function lentCount(items: InventoryItem[]): number {
  return items.reduce(
    (n, i) => (!i.archived && i.lentTo?.trim() ? n + 1 : n),
    0
  );
}
