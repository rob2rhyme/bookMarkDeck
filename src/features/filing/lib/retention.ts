// When a paper's time is up (ANALYSIS-FILING-LOG.md §5). Pure — see
// retention.test.ts. Nothing here reads the clock; callers pass `today`.
//
// The one thing consumer apps get wrong: retention does NOT run from when you
// filed the paper. A folder covers a date RANGE, and the clock starts at the
// calendar-year-end of that range — so a box of 2024 invoices filed in March
// 2025 becomes shreddable on 2031-12-31, not 2032-03-something. `created + N
// years` is off by most of a year, in the unsafe direction.

import { addMonths, bucketOf, daysBetween, isDate, type Bucket } from "@/features/filing/lib/obligations";
import type {
  FilingDocument,
  FilingFolder,
  RetentionAction,
  RetentionRule,
} from "@/features/filing/lib/types";

/* --------------------------------------------------------------- basics --- */

export function addYears(date: string, years: number): string {
  return addMonths(date, years * 12);
}

/** The calendar-year-end a retention clock starts from. 2024-03-09 → 2024-12-31. */
export function yearEnd(date: string): string {
  return `${date.slice(0, 4)}-12-31`;
}

/* -------------------------------------------------------------- presets --- */

/**
 * The rules users pick from, rather than authoring a schedule.
 *
 * These are GENERAL GUIDANCE, not legal or tax advice, and the UI says so where
 * they're chosen. Periods are jurisdiction-specific — state law, professional
 * body rules and your own circumstances all move them — so every rule is
 * editable and the note explains what the number is actually based on.
 */
export const RETENTION_RULES: RetentionRule[] = [
  // — Tax. The IRS period of limitations, which is what "keep it N years" means.
  {
    id: "tax-3",
    label: "Tax records — 3 years",
    action: "review",
    keepYears: 3,
    trigger: "fixed",
    note: "The IRS generally has 3 years from filing to assess more tax.",
  },
  {
    id: "tax-6",
    label: "Tax records — 6 years",
    action: "review",
    keepYears: 6,
    trigger: "fixed",
    note: "6 years if more than 25% of gross income was left off the return.",
  },
  {
    id: "tax-7",
    label: "Tax records — 7 years",
    action: "review",
    keepYears: 7,
    trigger: "fixed",
    note: "7 years for a claim from worthless securities or a bad-debt deduction.",
  },
  {
    id: "tax-return-permanent",
    label: "The tax return itself — keep",
    action: "permanent",
    trigger: "fixed",
    note: "No limit applies to an unfiled or fraudulent return. The return is one page a year; keep it and shred the supporting paper.",
  },
  // — Money.
  {
    id: "bank-1",
    label: "Bank & card statements — 1 year",
    action: "shred",
    keepYears: 1,
    trigger: "fixed",
    note: "Longer if a line on it supports a tax deduction — then it follows the tax rule.",
  },
  {
    id: "paystub-1",
    label: "Pay stubs — 1 year",
    action: "shred",
    keepYears: 1,
    trigger: "fixed",
    note: "Until you've checked them against the W-2.",
  },
  {
    id: "receipt-1",
    label: "Receipts — 1 year",
    action: "shred",
    keepYears: 1,
    trigger: "fixed",
    note: "Unless it backs a warranty, a deduction, or an insurance claim.",
  },
  {
    id: "utility-1",
    label: "Utility bills — 1 year",
    action: "shred",
    keepYears: 1,
    trigger: "fixed",
  },
  // — Employment. Federal floors; a state or a contract can be longer.
  {
    id: "payroll-3",
    label: "Payroll records — 3 years",
    action: "shred",
    keepYears: 3,
    trigger: "fixed",
    note: "The FLSA and ADEA floor for payroll records.",
  },
  {
    id: "wage-calc-2",
    label: "Wage computation records — 2 years",
    action: "shred",
    keepYears: 2,
    trigger: "fixed",
    note: "FLSA: time cards, wage-rate tables and work schedules.",
  },
  {
    id: "personnel-1",
    label: "Personnel records — 1 year",
    action: "shred",
    keepYears: 1,
    trigger: "fixed",
    note: "ADEA: 1 year from the record, or from the personnel action, whichever is later.",
  },
  // — Medical. The distinction most guides blur.
  {
    id: "hipaa-6",
    label: "HIPAA compliance records — 6 years",
    action: "archive",
    keepYears: 6,
    trigger: "fixed",
    note: "6 years from creation or last effective date. This covers policies and notices — NOT the clinical record.",
  },
  {
    id: "medical-10",
    label: "Medical records — 10 years",
    action: "review",
    keepYears: 10,
    trigger: "fixed",
    note: "HIPAA sets no clinical period; state law does, commonly 5–10 years for adults and longer for minors. Check yours.",
  },
  // — Things you own. These wait for an event, because the date isn't known yet.
  {
    id: "property-sold-3",
    label: "Property records — until sold, then 3 years",
    action: "review",
    keepYears: 3,
    trigger: "event",
    triggerEvent: "when the property is sold",
    note: "The limitation period runs from the return for the year you dispose of it.",
  },
  {
    id: "improvement-sold-3",
    label: "Home improvements — until sold, then 3 years",
    action: "review",
    keepYears: 3,
    trigger: "event",
    triggerEvent: "when the property is sold",
    note: "These receipts set your cost basis. Losing them costs money at sale.",
  },
  {
    id: "vehicle-sold",
    label: "Vehicle title — until sold",
    action: "review",
    keepYears: 0,
    trigger: "event",
    triggerEvent: "when the vehicle is sold",
    note: "The title goes with the car.",
  },
  {
    id: "loan-paid-3",
    label: "Loan papers — until paid off, then 3 years",
    action: "review",
    keepYears: 3,
    trigger: "event",
    triggerEvent: "when the loan is paid off",
    note: "Keep the payoff letter and the release permanently.",
  },
  {
    id: "policy-expired-1",
    label: "Insurance policy — 1 year after it ends",
    action: "review",
    keepYears: 1,
    trigger: "event",
    triggerEvent: "when the policy ends",
    note: "A claim can arrive after the policy does.",
  },
  {
    id: "warranty-end",
    label: "Warranty — until it expires",
    action: "shred",
    keepYears: 0,
    trigger: "event",
    triggerEvent: "when the warranty ends",
  },
  // — Never.
  {
    id: "deed-permanent",
    label: "Deeds & titles — keep",
    action: "permanent",
    trigger: "fixed",
  },
  {
    id: "vital-permanent",
    label: "Vital records — keep",
    action: "permanent",
    trigger: "fixed",
    note: "Birth, marriage, divorce, death, citizenship, Social Security.",
  },
  {
    id: "estate-permanent",
    label: "Wills, trusts & estate papers — keep",
    action: "permanent",
    trigger: "fixed",
    note: "Supersede the old one rather than shredding it — which version was current can matter later.",
  },
];

export const ruleById = (id?: string | null): RetentionRule | null =>
  (id && RETENTION_RULES.find((r) => r.id === id)) || null;

export const RETENTION_ACTION_LABELS: Record<RetentionAction, string> = {
  shred: "Shred",
  archive: "Archive",
  review: "Review",
  permanent: "Keep",
};

/* ------------------------------------------------------------- the maths --- */

/**
 * Which rule governs a paper: its own if set, otherwise the folder's. A document
 * can be stricter than the drawer it sits in, never looser by accident.
 */
export function resolveRule(
  document: Pick<FilingDocument, "retentionRuleId">,
  folder?: Pick<FilingFolder, "retentionRuleId"> | null
): RetentionRule | null {
  return ruleById(document.retentionRuleId) ?? ruleById(folder?.retentionRuleId);
}

/**
 * The date a paper stops being worth keeping, or null for "never" — either
 * because the rule is permanent, or because an event-triggered rule is still
 * waiting for its event to be posted.
 *
 * `overrideDestroyOn` on the document wins outright; that's the manual escape
 * hatch for the case the presets don't cover.
 */
export function destroyOnFor(
  document: Pick<FilingDocument, "retentionRuleId" | "overrideDestroyOn" | "docDate" | "filedAt">,
  folder?: Pick<
    FilingFolder,
    "retentionRuleId" | "coversThrough" | "eventDate" | "overrideDestroyOn"
  > | null
): string | null {
  if (isDate(document.overrideDestroyOn)) return document.overrideDestroyOn;

  const rule = resolveRule(document, folder);
  if (!rule || rule.action === "permanent") return null;

  const keep = rule.keepYears ?? 0;

  if (rule.trigger === "event") {
    // Nothing to compute until the event actually happens — a car you still own
    // has no shred date, and pretending otherwise would put it in the queue.
    const event = folder?.eventDate;
    return isDate(event) ? addYears(event, keep) : null;
  }

  // The cutoff, not the filing date. The folder's coverage range wins because it
  // describes what the paper is ABOUT; the paper's own date is the fallback.
  const basis = folder?.coversThrough ?? document.docDate ?? document.filedAt;
  return isDate(basis) ? addYears(yearEnd(basis), keep) : null;
}

/**
 * A folder's own date: the LONGEST of its contents, never the shortest. You
 * can't shred a folder because most of it has expired, and one permanent paper
 * (null) makes the whole folder permanent.
 */
export function folderDestroyOn(
  folder: Pick<FilingFolder, "id" | "retentionRuleId" | "coversThrough" | "eventDate" | "overrideDestroyOn">,
  documents: FilingDocument[]
): string | null {
  const mine = documents.filter((d) => d.folderId === folder.id && !d.archived);
  if (mine.length === 0) return null;
  let max: string | null = "";
  for (const d of mine) {
    const on = destroyOnFor(d, folder);
    if (on === null) return null; // permanent wins
    if (max !== null && on > max) max = on;
  }
  return max || null;
}

/* -------------------------------------------------------------- the queue --- */

export type ShredItem = {
  document: FilingDocument;
  folder: FilingFolder | null;
  rule: RetentionRule;
  destroyOn: string;
  bucket: Bucket;
  /** Negative when the date has already passed. */
  daysAway: number;
};

/**
 * Papers whose retention has run out, or is about to.
 *
 * A folder's `keepReason` is the consumer form of a legal hold: it takes the
 * paper out of the queue without touching the clock, so lifting the hold puts it
 * straight back rather than restarting the seven years.
 *
 * Nothing here deletes anything. This is a review queue; destruction is a
 * deliberate act with a receipt (`shredded` on the activity timeline).
 */
export function shredItems(
  documents: FilingDocument[],
  folders: FilingFolder[],
  today: string,
  leadDays: number
): ShredItem[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: ShredItem[] = [];
  for (const document of documents) {
    if (document.archived) continue;
    const folder = (document.folderId && byId.get(document.folderId)) || null;
    if (folder?.keepReason) continue;
    const rule = resolveRule(document, folder);
    if (!rule || rule.action === "permanent") continue;
    const destroyOn = destroyOnFor(document, folder);
    if (!destroyOn || daysBetween(today, destroyOn) > leadDays) continue;
    out.push({
      document,
      folder,
      rule,
      destroyOn,
      bucket: bucketOf(destroyOn, today),
      daysAway: daysBetween(today, destroyOn),
    });
  }
  return out.sort(
    (a, b) =>
      a.destroyOn.localeCompare(b.destroyOn) ||
      a.document.title.localeCompare(b.document.title)
  );
}

export function groupShredByBucket(items: ShredItem[]): [Bucket, ShredItem[]][] {
  const order: Bucket[] = ["overdue", "week", "month", "later"];
  return order
    .map((b) => [b, items.filter((i) => i.bucket === b)] as [Bucket, ShredItem[]])
    .filter(([, list]) => list.length > 0);
}
