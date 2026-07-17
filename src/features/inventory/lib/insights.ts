// Pure analytics for the Insights panel: category/location/tag mixes, status
// split, warranty outlook, and an acquisitions-over-time trend that surfaces
// how interests shift. No React/Firebase — see insights.test.ts. `today` is a
// YYYY-MM-DD string, never the clock.

import type { InventoryItem } from "@/features/inventory/lib/types";
import { daysUntil } from "@/features/inventory/lib/value";

export type Slice = { label: string; count: number };

const notArchived = (items: InventoryItem[]) => items.filter((i) => !i.archived);

/** Top-N counts of a labelled dimension, remainder folded into "Other". */
function topSlices(
  labels: (string | undefined)[],
  topN: number,
  fallback = "Uncategorized"
): Slice[] {
  const map = new Map<string, number>();
  for (const raw of labels) {
    const label = raw?.trim() || fallback;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  const sorted = [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (sorted.length <= topN) return sorted;
  const head = sorted.slice(0, topN);
  const rest = sorted.slice(topN).reduce((s, x) => s + x.count, 0);
  return [...head, { label: "Other", count: rest }];
}

/** Category share of the catalog (top 5 + Other). */
export function categoryShares(items: InventoryItem[], topN = 5): Slice[] {
  return topSlices(notArchived(items).map((i) => i.category), topN);
}

/** Item counts per location name (top N + Other). */
export function locationCounts(
  items: InventoryItem[],
  nameById: Record<string, string>,
  topN = 6
): Slice[] {
  return topSlices(
    notArchived(items).map((i) =>
      i.locationId ? nameById[i.locationId] ?? "Unassigned" : "Unassigned"
    ),
    topN,
    "Unassigned"
  );
}

/** Item counts per tag (an item counts once per tag; top N + Other). */
export function tagCounts(items: InventoryItem[], topN = 6): Slice[] {
  const tags = notArchived(items).flatMap((i) =>
    i.tags.map((t) => t.trim()).filter(Boolean)
  );
  if (tags.length === 0) return [];
  return topSlices(tags, topN);
}

/** Keeping vs lent / misplaced / lost / returned. */
export function statusMix(items: InventoryItem[]): Slice[] {
  const counts = { keeping: 0, lent: 0, misplaced: 0, lost: 0, returned: 0 };
  for (const i of notArchived(items)) {
    if (i.status === "returned") counts.returned++;
    else if (i.status === "lost") counts.lost++;
    else if (i.status === "misplaced") counts.misplaced++;
    else if (i.lentTo?.trim() || i.status === "lent") counts.lent++;
    else counts.keeping++;
  }
  return [
    { label: "Keeping", count: counts.keeping },
    { label: "Lent", count: counts.lent },
    { label: "Misplaced", count: counts.misplaced },
    { label: "Lost", count: counts.lost },
    { label: "Returned", count: counts.returned },
  ];
}

export type WarrantyBucket = {
  key: "expired" | "d30" | "d90" | "year" | "later";
  label: string;
  count: number;
};

/** Where warranties stand (returned/archived items excluded — they're gone).
 *  Items with no warranty date aren't bucketed; report them separately. */
export function warrantyBuckets(
  items: InventoryItem[],
  today: string
): { buckets: WarrantyBucket[]; uncovered: number } {
  const live = notArchived(items).filter((i) => i.status !== "returned");
  const buckets: WarrantyBucket[] = [
    { key: "expired", label: "Expired", count: 0 },
    { key: "d30", label: "≤30d", count: 0 },
    { key: "d90", label: "≤90d", count: 0 },
    { key: "year", label: "≤1yr", count: 0 },
    { key: "later", label: "Later", count: 0 },
  ];
  let uncovered = 0;
  for (const i of live) {
    if (!i.warrantyExpiry) {
      uncovered++;
      continue;
    }
    const d = daysUntil(i.warrantyExpiry, today);
    if (d === null) {
      uncovered++;
      continue;
    }
    if (d < 0) buckets[0].count++;
    else if (d <= 30) buckets[1].count++;
    else if (d <= 90) buckets[2].count++;
    else if (d <= 365) buckets[3].count++;
    else buckets[4].count++;
  }
  return { buckets, uncovered };
}

// ── Interest over time ──────────────────────────────────────────────────────

/** When an item entered your life: purchase date first, else created day. */
export function acquiredDay(item: InventoryItem): string | null {
  if (item.purchaseDate) return item.purchaseDate;
  const c = item.createdAt;
  return typeof c === "string" && c.length >= 10 ? c.slice(0, 10) : null;
}

const quarterOf = (day: string): string => {
  const y = day.slice(0, 4);
  const q = Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1;
  return `${y}-Q${q}`;
};

export type TrendSeries = { label: string; counts: number[] };
export type InterestTrend = { quarters: string[]; series: TrendSeries[] };

/**
 * Acquisitions per quarter for the top categories (plus Other) over the last
 * `maxQuarters` quarters that actually saw additions — the raw material for
 * "what am I into lately?".
 */
export function interestTrend(
  items: InventoryItem[],
  topN = 4,
  maxQuarters = 6
): InterestTrend {
  const rows: { quarter: string; category: string }[] = [];
  for (const i of notArchived(items)) {
    const day = acquiredDay(i);
    if (!day) continue;
    rows.push({ quarter: quarterOf(day), category: i.category?.trim() || "Uncategorized" });
  }
  if (rows.length === 0) return { quarters: [], series: [] };

  const quarters = [...new Set(rows.map((r) => r.quarter))].sort().slice(-maxQuarters);
  const inWindow = rows.filter((r) => quarters.includes(r.quarter));
  const top = topSlices(inWindow.map((r) => r.category), topN)
    .map((s) => s.label)
    .filter((l) => l !== "Other");

  const series: TrendSeries[] = [...top, "Other"].map((label) => ({
    label,
    counts: quarters.map(
      (q) =>
        inWindow.filter(
          (r) =>
            r.quarter === q &&
            (label === "Other" ? !top.includes(r.category) : r.category === label)
        ).length
    ),
  }));
  // Drop an all-zero Other row (every category made the cut).
  return {
    quarters,
    series: series.filter((s) => s.counts.some((c) => c > 0)),
  };
}

// ── Facts (deterministic — no AI needed) ────────────────────────────────────

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** A handful of grounded observations computed locally. */
export function localFacts(
  items: InventoryItem[],
  nameById: Record<string, string>,
  today: string
): string[] {
  const live = notArchived(items);
  const facts: string[] = [];
  if (live.length === 0) return facts;

  const cats = categoryShares(items, 1);
  if (cats.length > 0 && cats[0].label !== "Uncategorized") {
    facts.push(
      `${cats[0].label} is your biggest shelf — ${pct(cats[0].count, live.length)}% of everything you track.`
    );
  }

  const locs = locationCounts(items, nameById, 1);
  if (locs.length > 0 && locs[0].label !== "Unassigned") {
    facts.push(
      `${locs[0].label} holds the most stuff (${locs[0].count} item${locs[0].count === 1 ? "" : "s"}).`
    );
  }

  const mix = statusMix(items);
  const returned = mix.find((s) => s.label === "Returned")?.count ?? 0;
  if (returned > 0) {
    facts.push(
      `You've sent ${returned} faulty item${returned === 1 ? "" : "s"} back under warranty — ${pct(returned, live.length)}% of the catalog. Good instincts.`
    );
  }
  const lost = mix.find((s) => s.label === "Lost")?.count ?? 0;
  const keeping = mix.find((s) => s.label === "Keeping")?.count ?? 0;
  if (lost === 0 && keeping > 0) {
    facts.push(`Nothing is marked lost. ${keeping} things, all accounted for.`);
  }

  const { buckets, uncovered } = warrantyBuckets(items, today);
  const ending = buckets[1].count + buckets[2].count;
  if (ending > 0) {
    facts.push(
      `${ending} warrant${ending === 1 ? "y ends" : "ies end"} within 90 days — worth a look before they lapse.`
    );
  } else if (uncovered > 0 && uncovered === live.filter((i) => i.status !== "returned").length) {
    facts.push("No warranty dates on record yet — add them to get quiet reminders.");
  }

  const trend = interestTrend(items);
  if (trend.quarters.length >= 2) {
    const last = trend.quarters.length - 1;
    const perSeries = trend.series
      .filter((s) => s.label !== "Other" && s.label !== "Uncategorized")
      .map((s) => ({
        label: s.label,
        recent: s.counts[last],
        before: s.counts.slice(0, last).reduce((a, b) => a + b, 0),
      }));
    const rising = perSeries
      .filter((s) => s.recent >= 2 && s.recent > s.before / Math.max(1, last))
      .sort((a, b) => b.recent - a.recent)[0];
    if (rising) {
      facts.push(
        `${rising.label} is having a moment — ${rising.recent} addition${rising.recent === 1 ? "" : "s"} in the latest quarter alone.`
      );
    }
  }

  return facts;
}

// ── Payload for the AI analysis (aggregates only — no names of things) ──────

/** Compact, anonymized aggregates the AI route analyzes. Category/location/tag
 *  labels are included; item names, serials, and notes never are. */
export function insightsSummary(
  items: InventoryItem[],
  nameById: Record<string, string>,
  today: string
): Record<string, unknown> {
  return {
    today,
    totalItems: notArchived(items).length,
    categories: categoryShares(items, 8),
    locations: locationCounts(items, nameById, 8),
    tags: tagCounts(items, 10),
    statusMix: statusMix(items),
    warranty: warrantyBuckets(items, today),
    trend: interestTrend(items, 5, 8),
  };
}
