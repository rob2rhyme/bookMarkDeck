// What a paper obliges you to DO — renew it, pay it, file it, get it inspected.
// This is the half of the pillar with a weekly reason to open the app
// (ANALYSIS-FILING-LOG.md §6). Pure — see obligations.test.ts.
//
// All dates are local YYYY-MM-DD strings. Arithmetic runs in UTC so a DST
// boundary can never shift a due date by a day; nothing here reads the clock,
// so callers pass `today` and the whole module stays testable.

import type {
  FilingDocument,
  Obligation,
  ObligationKind,
  Recurrence,
} from "@/features/filing/lib/types";

/* ------------------------------------------------------------ date math --- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(s: string | null | undefined): s is string {
  return typeof s === "string" && DATE_RE.test(s);
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`. Negative when `b` is in the past. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/**
 * Add months, clamping the day to the target month's length — so a renewal due
 * on the 31st lands on the 28th/29th/30th rather than skidding into the next
 * month. Jan 31 + 1 month is Feb 28, not Mar 3.
 */
export function addMonths(date: string, months: number): string {
  const src = toUtc(date);
  const day = src.getUTCDate();
  const target = new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}

/* ---------------------------------------------------------- recurrence --- */

const MONTHS: Record<Exclude<Recurrence, "none" | "custom">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Months in one period, or null when the obligation doesn't repeat. */
export function periodMonths(o: Pick<Obligation, "repeat" | "repeatMonths">): number | null {
  if (!o.repeat || o.repeat === "none") return null;
  if (o.repeat === "custom") {
    const n = o.repeatMonths;
    return typeof n === "number" && n > 0 ? Math.floor(n) : null;
  }
  return MONTHS[o.repeat];
}

/** An obligation still wants doing: not archived, and not a completed one-off. */
export function isOpen(o: Obligation): boolean {
  if (o.archived) return false;
  if (o.completedOn && periodMonths(o) === null) return false;
  return true;
}

/**
 * Mark one occurrence done.
 *
 * A repeat advances by exactly ONE period from its own due date — never to the
 * next future date. If a monthly bill went three months unpaid, marking it done
 * records that you paid *one* of them and the next is still overdue. Catching up
 * silently would hide the two you missed, which is the opposite of what a
 * reminder is for.
 *
 * A one-off just records the completion and drops out of `isOpen`.
 */
export function complete(o: Obligation, on: string): Obligation {
  const months = periodMonths(o);
  if (months === null) return { ...o, completedOn: on };
  return { ...o, completedOn: on, dueOn: addMonths(o.dueOn, months) };
}

/* -------------------------------------------------------------- status --- */

export type Bucket = "overdue" | "week" | "month" | "later";

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  week: "This week",
  month: "This month",
  later: "Later",
};

export function bucketOf(dueOn: string, today: string): Bucket {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  return "later";
}

/**
 * Should this obligation be nudging yet? Overdue always counts; otherwise it
 * enters the window `leadDays` before it's due. `leadDays` on the obligation
 * overrides the account default, so a passport can warn months ahead while a
 * bill waits until the week of.
 */
export function isDue(o: Obligation, today: string, defaultLeadDays: number): boolean {
  if (!isOpen(o) || !isDate(o.dueOn)) return false;
  const lead = typeof o.leadDays === "number" && o.leadDays >= 0 ? o.leadDays : defaultLeadDays;
  return daysBetween(today, o.dueOn) <= lead;
}

/* ------------------------------------------------------- doc-level view --- */

/**
 * The earliest open due date on a document, or null. Cached on the document as
 * `nextDueOn` and recomputed on EVERY mutation — a stale cache is what makes a
 * badge lie.
 */
export function nextDueOn(obligations: Obligation[] | undefined): string | null {
  const open = (obligations ?? []).filter((o) => isOpen(o) && isDate(o.dueOn));
  if (open.length === 0) return null;
  return open.reduce((min, o) => (o.dueOn < min ? o.dueOn : min), open[0].dueOn);
}

export type DueItem = {
  document: FilingDocument;
  obligation: Obligation;
  bucket: Bucket;
  /** Negative when overdue. */
  daysAway: number;
};

/** Every obligation currently worth showing, soonest first. */
export function dueItems(
  documents: FilingDocument[],
  today: string,
  defaultLeadDays: number
): DueItem[] {
  const out: DueItem[] = [];
  for (const document of documents) {
    if (document.archived) continue;
    for (const obligation of document.obligations ?? []) {
      if (!isDue(obligation, today, defaultLeadDays)) continue;
      out.push({
        document,
        obligation,
        bucket: bucketOf(obligation.dueOn, today),
        daysAway: daysBetween(today, obligation.dueOn),
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.obligation.dueOn.localeCompare(b.obligation.dueOn) ||
      a.document.title.localeCompare(b.document.title)
  );
}

/** Group for the panel, dropping empty buckets so the UI has nothing to skip. */
export function groupByBucket(items: DueItem[]): [Bucket, DueItem[]][] {
  const order: Bucket[] = ["overdue", "week", "month", "later"];
  return order
    .map((b) => [b, items.filter((i) => i.bucket === b)] as [Bucket, DueItem[]])
    .filter(([, list]) => list.length > 0);
}

/** Human "in 3 days" / "2 days ago" / "today". */
export function relativeDue(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway === -1) return "yesterday";
  if (daysAway > 0) return `in ${daysAway} days`;
  return `${Math.abs(daysAway)} days ago`;
}

/* ------------------------------------------------------------- presets --- */

/**
 * Common cadences, so adding "renew by" is one tap rather than a date-picker
 * chore. These are DEFAULTS, not authority: renewal periods are
 * jurisdiction-specific and the UI says so. Users edit freely.
 */
export type ObligationPreset = {
  id: string;
  label: string;
  kind: ObligationKind;
  repeat: Recurrence;
  repeatMonths?: number;
  leadDays?: number;
};

export const OBLIGATION_PRESETS: ObligationPreset[] = [
  { id: "passport", label: "Passport", kind: "renew", repeat: "custom", repeatMonths: 120, leadDays: 180 },
  { id: "licence", label: "Driver's licence", kind: "renew", repeat: "custom", repeatMonths: 48, leadDays: 60 },
  { id: "registration", label: "Vehicle registration", kind: "renew", repeat: "yearly", leadDays: 30 },
  { id: "inspection", label: "Vehicle inspection", kind: "inspect", repeat: "yearly", leadDays: 30 },
  { id: "policy", label: "Insurance policy", kind: "renew", repeat: "yearly", leadDays: 45 },
  { id: "premium", label: "Insurance premium", kind: "pay", repeat: "monthly", leadDays: 10 },
  { id: "prof-licence", label: "Professional licence", kind: "renew", repeat: "custom", repeatMonths: 24, leadDays: 60 },
  { id: "est-tax", label: "Estimated tax", kind: "pay", repeat: "quarterly", leadDays: 21 },
  { id: "tax-return", label: "Tax return", kind: "file", repeat: "yearly", leadDays: 60 },
  { id: "warranty-end", label: "Warranty ends", kind: "expires", repeat: "none", leadDays: 30 },
  { id: "one-off", label: "One-off", kind: "pay", repeat: "none" },
];
