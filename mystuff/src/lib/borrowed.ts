// Pure helpers for things you've borrowed or rented FROM others — the mirror
// of lending.ts. No React/Firebase — see borrowed.test.ts.

import type { InventoryItem } from "@/lib/types";
import { daysUntil, paidWithTax } from "@/lib/value";
import { lastOf } from "@/lib/activity";

export type BorrowEntry = {
  item: InventoryItem;
  from?: string;
  returnBy?: string;
  /** Days until it's due back (negative = overdue). Null when no date. */
  daysLeft: number | null;
  overdue: boolean;
  /** What this cost you — fee × qty + damage-cover/warranty + tax. */
  cost: number;
  /** ISO timestamp of the give-back (history entries only). */
  returnedAt: string | null;
};

/** Current borrowed/rented items + the returned history, both with costs.
 *  "Given back" = the shared 🔙 Returned status; its moment comes from the
 *  refunded activity event. */
export function borrowedLedger(
  items: InventoryItem[],
  today: string
): { out: BorrowEntry[]; history: BorrowEntry[] } {
  const mine = items.filter((i) => i.origin && !i.archived);
  const entry = (i: InventoryItem): BorrowEntry => {
    const d = i.borrowReturnBy ? daysUntil(i.borrowReturnBy, today) : null;
    return {
      item: i,
      from: i.borrowedFrom?.trim() || undefined,
      returnBy: i.borrowReturnBy,
      daysLeft: d,
      overdue: d !== null && d < 0,
      cost: paidWithTax(i),
      returnedAt: lastOf(i, "refunded"),
    };
  };
  const out = mine
    .filter((i) => i.status !== "returned")
    .map(entry)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  const history = mine
    .filter((i) => i.status === "returned")
    .map(entry)
    .sort((a, b) => (b.returnedAt ?? "").localeCompare(a.returnedAt ?? ""));
  return { out, history };
}

/** Total spent on borrowing/renting (fees incl. tax), history included —
 *  rent is money gone whether or not the thing went back. */
export function borrowSpend(items: InventoryItem[]): number {
  return items
    .filter((i) => i.origin && !i.archived)
    .reduce((sum, i) => sum + paidWithTax(i), 0);
}
