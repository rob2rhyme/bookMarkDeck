// Pure helpers for digital products — subscriptions and one-time purchases.
// No React/Firebase — see digital.test.ts.

import type { InventoryItem } from "@/lib/types";
import {
  daysUntil,
  monthlyEquivalent,
  nextRenewal,
  paidWithTax,
} from "@/lib/value";

export type SubscriptionEntry = {
  item: InventoryItem;
  /** Next renewal on/after today (auto-rolled forward by the cycle). */
  nextOn: string | null;
  daysLeft: number | null;
  /** Per-cycle cost, tax included. */
  perCycle: number;
  /** Normalized to per-month, tax included. */
  monthly: number;
};

/** The subscriptions ledger: active subs sorted soonest-renewal-first, plus
 *  the recurring totals ("what am I paying for?"). One-time digital purchases
 *  are listed separately with their lifetime spend. */
export function subscriptionLedger(
  items: InventoryItem[],
  today: string
): {
  subs: SubscriptionEntry[];
  oneTime: InventoryItem[];
  monthlyTotal: number;
  yearlyTotal: number;
  oneTimeSpend: number;
} {
  const digital = items.filter(
    (i) => i.kind === "digital" && !i.archived && i.status !== "returned"
  );
  const subs = digital
    .filter((i) => i.billingCycle === "monthly" || i.billingCycle === "yearly")
    .map((i): SubscriptionEntry => {
      const nextOn = nextRenewal(i, today);
      return {
        item: i,
        nextOn,
        daysLeft: nextOn ? daysUntil(nextOn, today) : null,
        perCycle: paidWithTax(i),
        monthly: monthlyEquivalent(i),
      };
    })
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  const oneTime = digital.filter(
    (i) => !i.billingCycle || i.billingCycle === "once"
  );
  const monthlyTotal = subs.reduce((s, e) => s + e.monthly, 0);
  return {
    subs,
    oneTime,
    monthlyTotal,
    yearlyTotal: monthlyTotal * 12,
    oneTimeSpend: oneTime.reduce((s, i) => s + paidWithTax(i), 0),
  };
}
