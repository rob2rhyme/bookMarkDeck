// The one-line summary the My Stuff push carries (ENGAGEMENT-ROADMAP.md, Tier 1).
// Pure — see digest.test.ts.
//
// Same shape and the same limit as Filing's digest: /api/push/schedule clamps
// delays to 24 hours, so this is ONE message a day re-armed whenever My Stuff
// is opened, not an alarm per item. If the app isn't opened for more than a day
// the digest pauses; the Attention panel and the nav badge stay the reliable
// surface. The count is `reminderCount`, so the push and the badge agree.

import { reminderCount, type Attention } from "@/features/inventory/lib/value";
import type { InventoryItem } from "@/features/inventory/lib/types";

export type InventoryDigest = {
  title: string;
  body: string;
  /** Total things wanting attention — 0 means "send nothing". */
  count: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Join with commas and a final "and": "a, b and c". */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

type Group = { items: InventoryItem[]; title: string; short: string };

/** Most time-sensitive first: food going off, a renewal to cancel, then upkeep, loans, warranties. */
function groups(a: Attention): Group[] {
  const g = (items: InventoryItem[], title: (n: number) => string, short: (n: number) => string): Group => ({
    items,
    title: title(items.length),
    short: short(items.length),
  });
  return [
    g(a.useByExpired, (n) => `${plural(n, "item")} past use-by`, (n) => `${n} past use-by`),
    g(a.renewsSoon, (n) => `${plural(n, "subscription")} renewing soon`, (n) => `${plural(n, "renewal")} soon`),
    g(a.maintenanceOverdue, (n) => `${plural(n, "upkeep task")} overdue`, (n) => `${n} upkeep overdue`),
    g(a.returnOverdue, (n) => `${plural(n, "loan")} overdue`, (n) => `${plural(n, "loan")} overdue`),
    g(a.useBySoon, (n) => `${plural(n, "item")} to use up soon`, (n) => `${n} to use up`),
    g(a.warrantySoon, (n) => `${plural(n, "warranty", "warranties")} ending soon`, (n) => `${plural(n, "warranty", "warranties")} ending`),
    g(a.maintenanceSoon, (n) => `${plural(n, "upkeep task")} coming up`, (n) => `${n} upkeep coming up`),
    g(a.lowStock, (n) => `${plural(n, "item")} running low`, (n) => `${n} running low`),
    g(a.warrantyExpired, (n) => `${plural(n, "warranty", "warranties")} ended`, (n) => `${n} warranties ended`),
  ].filter((x) => x.items.length > 0);
}

/**
 * Build the daily digest. The title states the most urgent fact (on a locked
 * phone it is often all you see); the body names that group's items when few
 * enough to be useful, then counts the rest. `maxNamed` 0 names nothing.
 */
export function buildInventoryDigest(a: Attention, maxNamed = 3): InventoryDigest {
  const count = reminderCount(a);
  const gs = groups(a);
  if (count === 0 || gs.length === 0) return { title: "", body: "", count: 0 };

  const [first, ...rest] = gs;
  const named = first.items.slice(0, maxNamed).map((i) => i.name.trim() || "Untitled item");
  const more = first.items.length - named.length;
  // maxNamed 0 (a locked app) names nothing: the title's count says it.
  const names = named.length === 0 ? "" : more > 0 ? `${named.join(", ")} and ${more} more` : list(named);
  const others = list(rest.map((r) => r.short));
  const body = [names, others].filter(Boolean).join(" · ");

  return { title: first.title, body, count };
}
