// What the filing log says about itself: how much paper you've handled, what
// kind of handling it was, and whether the pile is growing or shrinking.
//
// Everything is derived from the activity timelines already on documents and
// folders — nothing new is stored. That has one honest consequence, stated
// wherever the numbers appear: each timeline is capped at 300 entries
// (MAX_ACTIVITY), so a very long-lived record's earliest events age out and the
// counts here are "recent history", not an audit ledger.
//
// Pure — see stats.test.ts.

import { destroyOnFor } from "@/features/filing/lib/retention";
import type {
  FilingActivity,
  FilingActivityType,
  FilingDocument,
  FilingFolder,
} from "@/features/filing/lib/types";
import { dayKeyOf } from "@/lib/dayKey";

/** The activity kinds worth charting, in the order a legend should read. */
export const TRACKED_ACTIVITY: FilingActivityType[] = [
  "filed",
  "renewed",
  "paid",
  "reviewed",
  "shredded",
  "taken",
  "returned",
  "moved",
];

export const ACTIVITY_LABELS: Record<FilingActivityType, string> = {
  filed: "Filed",
  moved: "Moved",
  taken: "Taken out",
  returned: "Returned",
  renewed: "Renewed",
  paid: "Paid",
  reviewed: "Reviewed",
  shredded: "Cleared",
  copied: "Copied",
  note: "Note",
};

/* ------------------------------------------------------------- gathering --- */

export type DatedActivity = { type: FilingActivityType; day: string };

/** Flatten every timeline into `{type, day}`, dropping anything undated. */
export function allActivity(
  documents: FilingDocument[],
  folders: FilingFolder[]
): DatedActivity[] {
  const out: DatedActivity[] = [];
  const take = (list: FilingActivity[] | undefined) => {
    for (const a of list ?? []) {
      if (typeof a?.at !== "string") continue;
      // The LOCAL day: `today` is local, and slicing the UTC date moved a US
      // evening onto the next day — out of its month, and off the chart.
      const day = dayKeyOf(a.at);
      if (!day) continue;
      out.push({ type: a.type, day });
    }
  };
  for (const d of documents) take(d.activity);
  for (const f of folders) take(f.activity);
  return out;
}

/* --------------------------------------------------------------- months --- */

/** The `count` calendar months ending with the one `today` falls in. */
export function monthsEnding(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export type MonthBucket = {
  month: string; // YYYY-MM
  label: string; // "Aug"
  total: number;
  byType: Record<string, number>;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/**
 * Activity per month, including months with nothing in them — a chart with
 * gaps silently rescales its own x-axis and makes a quiet month look like no
 * month at all.
 */
export function activityByMonth(
  activity: DatedActivity[],
  today: string,
  months = 12
): MonthBucket[] {
  const wanted = monthsEnding(today, months);
  const index = new Map(
    wanted.map((month) => [
      month,
      { month, label: monthLabel(month), total: 0, byType: {} as Record<string, number> },
    ])
  );
  for (const a of activity) {
    const bucket = index.get(a.day.slice(0, 7));
    if (!bucket) continue;
    bucket.total++;
    bucket.byType[a.type] = (bucket.byType[a.type] ?? 0) + 1;
  }
  return wanted.map((m) => index.get(m)!);
}

/** Totals per activity kind, biggest first, zero-counts dropped. */
export function totalsByType(activity: DatedActivity[]): { type: FilingActivityType; count: number }[] {
  const counts = new Map<FilingActivityType, number>();
  for (const a of activity) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/* -------------------------------------------------------------- headline --- */

export type FilingSummary = {
  papers: number;
  folders: number;
  places: number;
  /** Papers filed in the current calendar month. */
  filedThisMonth: number;
  /** Renewals + payments completed in the last 12 months. */
  handledThisYear: number;
  /** Papers archived with a shred receipt, all time in the retained window. */
  cleared: number;
  /** Papers carrying at least one open obligation. */
  withReminders: number;
  /** Papers with a retention date already reached. */
  readyToClear: number;
  /** Papers linked to the bookmark for their account. */
  linked: number;
};

export function summarize(
  documents: FilingDocument[],
  folders: FilingFolder[],
  placeCount: number,
  today: string
): FilingSummary {
  const active = documents.filter((d) => !d.archived);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const month = today.slice(0, 7);
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 10)}`;

  const activity = allActivity(documents, folders);

  return {
    papers: active.length,
    folders: folders.filter((f) => !f.archived).length,
    places: placeCount,
    filedThisMonth: activity.filter((a) => a.type === "filed" && a.day.startsWith(month)).length,
    handledThisYear: activity.filter(
      (a) => (a.type === "renewed" || a.type === "paid") && a.day >= yearAgo
    ).length,
    cleared: activity.filter((a) => a.type === "shredded").length,
    withReminders: active.filter((d) => (d.obligations ?? []).some((o) => !o.archived)).length,
    readyToClear: active.filter((d) => {
      const folder = (d.folderId && byId.get(d.folderId)) || null;
      if (folder?.keepReason) return false;
      const on = destroyOnFor(d, folder);
      return Boolean(on && on <= today);
    }).length,
    linked: active.filter((d) => Boolean(d.bookmarkLink)).length,
  };
}

/* ---------------------------------------------------------- distribution --- */

export type Slice = { key: string; label: string; count: number };

/** Papers per folder, biggest first, with unfiled counted as its own bucket. */
export function papersByFolder(
  documents: FilingDocument[],
  folders: FilingFolder[],
  limit = 6
): Slice[] {
  const names = new Map(folders.map((f) => [f.id, f.name]));
  const counts = new Map<string, number>();
  for (const d of documents) {
    if (d.archived) continue;
    const key = d.folderId ?? "__unfiled__";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all = [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key === "__unfiled__" ? "Unfiled" : names.get(key) ?? "Deleted folder",
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  if (all.length <= limit) return all;
  const head = all.slice(0, limit);
  const rest = all.slice(limit).reduce((n, s) => n + s.count, 0);
  return [...head, { key: "__other__", label: `${all.length - limit} more`, count: rest }];
}
