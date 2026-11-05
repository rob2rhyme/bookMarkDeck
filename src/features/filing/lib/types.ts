// Types for the "Filing" pillar — where physical paper lives, and what it
// obliges you to do (ANALYSIS-FILING-LOG.md). Pure type declarations + a few
// label consts — no React/Firebase — mirroring features/inventory/lib/types.ts.
// Kept fully under src/features/filing/ so the pillar stays removable and never
// touches bookmark or inventory data.

import type { SealedText } from "@/lib/vault/vault";

/** The furniture. A place nests: site → room → cabinet → drawer/shelf/box. */
export type PlaceKind =
  | "site"
  | "room"
  | "cabinet"
  | "drawer"
  | "shelf"
  | "box"
  | "binder";

export const PLACE_KINDS: { id: PlaceKind | ""; label: string; icon: string }[] = [
  { id: "", label: "Place", icon: "📍" },
  { id: "site", label: "Location", icon: "🏠" },
  { id: "room", label: "Room", icon: "🚪" },
  { id: "cabinet", label: "Cabinet", icon: "🗄️" },
  { id: "drawer", label: "Drawer", icon: "🗃️" },
  { id: "shelf", label: "Shelf", icon: "📚" },
  { id: "box", label: "Box", icon: "📦" },
  { id: "binder", label: "Binder", icon: "📒" },
];

/**
 * Nestable physical place — same shape family as InventoryLocation, kept
 * separate (its own subcollection) so the feature is removable and never reuses
 * inventory locations. A drawer and a storage bin are different things even when
 * they sit in the same room.
 */
export type FilingPlace = {
  id: string;
  name: string; // "Garage", "Grey cabinet", "Drawer 2"
  parentId: string | null;
  kind?: PlaceKind;
  /**
   * What this place HOLDS, as written on its label: "A-J", "Taxes", "2019",
   * "Misc." Stored as the typed text because that text is what gets printed on
   * the sticker; the rule behind it is parsed on read (lib/drawers.ts) rather
   * than stored alongside, so the two can never drift apart.
   */
  contents?: string;
  note?: string;
  sortOrder?: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * Whose paper this is. A label on a folder inside ONE owner's account — not a
 * second user, and not household multi-user (ruled out in ENGAGEMENT-ROADMAP.md).
 * Nobody else signs in; nothing is shared between accounts.
 */
export type PartyKind = "self" | "family" | "client" | "business" | "other";

export const PARTY_KINDS: { id: PartyKind; label: string; icon: string }[] = [
  { id: "self", label: "Me", icon: "🙋" },
  { id: "family", label: "Family", icon: "👨‍👩‍👧" },
  { id: "client", label: "Client", icon: "🤝" },
  { id: "business", label: "Business", icon: "🏢" },
  { id: "other", label: "Other", icon: "🏷️" },
];

/** Folder-tab colours. Ramp tokens only, so both themes work (CLAUDE.md). */
export const TAB_COLORS = [
  "slate",
  "blue",
  "emerald",
  "amber",
  "red",
  "violet",
  "teal",
] as const;

export type TabColor = (typeof TAB_COLORS)[number];

export type FilingParty = {
  id: string;
  name: string; // "Mom", "Client: Acme Ltd"
  kind: PartyKind;
  color?: TabColor;
  note?: string;
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * What happens to a paper when its time is up. Ships as presets rather than a
 * schedule authoring UI — see lib/retention.ts (Phase 4).
 */
export type RetentionAction = "shred" | "archive" | "review" | "permanent";

export type RetentionRule = {
  id: string;
  label: string; // "Tax returns — 7 years"
  action: RetentionAction;
  keepYears?: number; // undefined when action === "permanent"
  /** "fixed" runs from the calendar-year-end cutoff of coversThrough.
   *  "event" waits for eventDate to be posted, then adds keepYears. */
  trigger: "fixed" | "event";
  triggerEvent?: string; // "when the car is sold"
  note?: string; // "IRS keeps 6 years for under-reported income"
};

/**
 * The file folder you physically pull out.
 *
 * `homePlaceId` vs `currentPlaceId` is the whole custody model: checked-out is
 * not a flag, it is `current !== home`. One comparison covers "Dad borrowed it",
 * "it's on my desk" and "it's at the accountant's" — the digital form of the
 * paper charge-out card file rooms have used for a century.
 */
export type FilingFolder = {
  id: string;
  name: string; // "Vehicles", "2024 Taxes"
  homePlaceId: string | null;
  currentPlaceId: string | null;
  parentId: string | null; // a manila file inside a hanging folder
  partyId?: string | null;
  category?: string; // free text; suggestions derived from existing folders
  tabColor?: TabColor;
  /** Every word you might search for later — "Car", "Auto", "Taurus". */
  aliases: string[];
  tags: string[];
  // Retention (Phase 4). Stored from day one so nothing needs migrating.
  retentionRuleId?: string | null; // inherited by documents unless overridden
  coversFrom?: string; // YYYY-MM-DD
  coversThrough?: string; // YYYY-MM-DD — the retention cutoff runs off THIS
  eventDate?: string | null; // set when an "event" trigger actually happens
  overrideDestroyOn?: string | null;
  /** Consumer form of a legal hold: mutes the reminder, never resets the clock. */
  keepReason?: string | null;
  // Custody — only meaningful while currentPlaceId !== homePlaceId.
  heldBy?: string | null;
  takenAt?: string | null; // YYYY-MM-DD
  dueBack?: string | null; // YYYY-MM-DD
  /** Where it has been. Custody events live here rather than on the papers —
   *  you check out the folder, not each sheet inside it. Capped like documents'. */
  activity?: FilingActivity[];
  note?: string;
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** What kind of paper it is. Drives the icon and, later, the retention preset. */
export type DocType =
  | "id"
  | "tax"
  | "financial"
  | "property"
  | "vehicle"
  | "insurance"
  | "medical"
  | "legal"
  | "education"
  | "employment"
  | "warranty"
  | "correspondence"
  | "pet"
  | "other";

export const DOC_TYPES: { id: DocType | ""; label: string; icon: string }[] = [
  { id: "", label: "Unsorted", icon: "📄" },
  { id: "id", label: "ID & vital records", icon: "🪪" },
  { id: "tax", label: "Tax", icon: "🧾" },
  { id: "financial", label: "Financial", icon: "🏦" },
  { id: "property", label: "Property", icon: "🏡" },
  { id: "vehicle", label: "Vehicle", icon: "🚗" },
  { id: "insurance", label: "Insurance", icon: "🛡️" },
  { id: "medical", label: "Medical", icon: "🩺" },
  { id: "legal", label: "Legal", icon: "⚖️" },
  { id: "education", label: "Education", icon: "🎓" },
  { id: "employment", label: "Employment", icon: "💼" },
  { id: "warranty", label: "Warranty", icon: "🔧" },
  { id: "correspondence", label: "Letters", icon: "✉️" },
  { id: "pet", label: "Pet", icon: "🐾" },
  { id: "other", label: "Other", icon: "🗂️" },
];

/**
 * A dated thing a paper obliges you to DO (Phase 3). Embedded on the document
 * rather than given its own collection: a document has one to three of these,
 * and the "what's coming up" view already holds every document in memory.
 */
export type ObligationKind = "renew" | "expires" | "pay" | "file" | "inspect";

export const OBLIGATION_KINDS: {
  id: ObligationKind;
  label: string;
  icon: string;
}[] = [
  { id: "renew", label: "Renew", icon: "🔄" },
  { id: "expires", label: "Expires", icon: "⌛" },
  { id: "pay", label: "Pay", icon: "💳" },
  { id: "file", label: "File", icon: "📮" },
  { id: "inspect", label: "Inspect", icon: "🔎" },
];

export type Recurrence = "none" | "monthly" | "quarterly" | "yearly" | "custom";

export type Obligation = {
  id: string;
  kind: ObligationKind;
  dueOn: string; // YYYY-MM-DD
  label?: string; // "Premium — Q3", "Emissions test"
  amount?: number; // "pay" only
  currency?: string;
  repeat?: Recurrence;
  repeatMonths?: number; // when repeat === "custom"
  leadDays?: number; // nudge this early; default from settings
  completedOn?: string | null; // paid/renewed on — a repeat rolls to the next
  /** Which preset created this, when one did. Kept because some rules key off
   *  the document rather than the date — a passport's six-month travel-validity
   *  window can't be inferred from "renew in 120 months". */
  presetId?: string;
  archived?: boolean;
};

/**
 * A scan or PDF attached to a paper. Lives in its own subcollection
 * (`filingDocs`) rather than on the document: attachments are the one part of
 * this pillar that grows without bound, and the slim projection exists to keep
 * the document list cheap.
 *
 * `path` is the R2 object key, kept so the object can be cleaned up when the
 * record goes. `url` is the public URL, denormalised so the list renders
 * without a second lookup.
 */
export type FilingAttachment = {
  id: string;
  documentId: string;
  name: string;
  contentType: string;
  size: number;
  path: string;
  url: string;
  addedAt: string | null;
};

export type FilingActivityType =
  | "filed"
  | "moved"
  | "taken"
  | "returned"
  | "renewed"
  | "paid"
  | "reviewed"
  | "shredded"
  | "copied"
  | "note";

/** A single event in a document's life — the raw record the timeline shows. */
export type FilingActivity = {
  id: string;
  type: FilingActivityType;
  at: string; // ISO timestamp
  to?: string; // person a folder went to
  fromPlace?: string; // place name (snapshot) it moved from
  toPlace?: string; // place name (snapshot) it moved to
  note?: string;
};

/** The paper itself. */
export type FilingDocument = {
  id: string;
  title: string; // "2023 Form 1040"
  folderId: string | null; // null = the Unfiled inbox
  partyId?: string | null; // defaults to the folder's party
  docType?: DocType;
  docDate?: string; // YYYY-MM-DD — the date printed on the paper
  filedAt?: string; // YYYY-MM-DD — when you put it away
  isOriginal?: boolean; // the legally-significant copy
  copies?: number;
  /**
   * True exactly while the paper is LOCKED (`lock` is set). It used to be a UI gate
   * with nothing behind it; it is kept as the flag lists and exports read, and
   * `withLockInvariant` (hooks/useFilingDocuments) keeps it equal to `Boolean(lock)`.
   */
  confidential?: boolean;
  /**
   * `reference` and `note`, encrypted on this device with the account's vault (the
   * one Notes uses) and bound to this paper's id. While set, those two fields are
   * ALWAYS absent from state, cache and Firestore — the plaintext exists only in
   * the open form's memory. Title, dates, folder, tags, aliases and obligations
   * stay readable: lists, search, reminders and the badge need them.
   */
  lock?: SealedText | null;
  retentionRuleId?: string | null; // overrides the folder's
  overrideDestroyOn?: string | null;
  obligations: Obligation[]; // Phase 3
  /** DERIVED cache of the earliest open obligation. Recomputed on every write and
   *  kept in the slim localStorage projection so the nav badge works offline. */
  nextDueOn?: string | null;
  /** DERIVED. The two halves of "is anything nudging yet", split so the badge can
   *  apply each obligation's own lead time without loading the array. See
   *  `nudgeDates` in lib/obligations.ts. */
  remindFrom?: string | null;
  nextDueDefault?: string | null;
  reference?: string; // policy no., account no., case no.
  aliases: string[];
  tags: string[];
  note?: string;
  /** The connection that earns this pillar its place: the online account this
   *  paper belongs to. Denormalised so it still renders if the bookmark moves. */
  bookmarkLink?: { id: string; title: string; url: string } | null;
  hasAttachment?: boolean; // slim flag; the blob lives in filingDocs (Phase 6)
  activity?: FilingActivity[]; // capped — see MAX_ACTIVITY in useFilingDocuments
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** Set on a record rebuilt from the slim on-device cache: its notes, reference,
   *  aliases, obligations and history were not cached, so they are MISSING here,
   *  not empty. `saveDocument` refuses one — written to Firestore (no merge) it
   *  would replace the full cloud copy. Cleared only by the cloud copy arriving,
   *  or by the cloud turning out to have no copy at all. */
  partial?: true;
};

/** A document known to hold every field — the only kind that may be written to
 *  Firestore. Narrow with `isComplete` in useFilingDocuments. */
export type CompleteDocument = FilingDocument & { partial?: undefined };

export type FilingView = "folders" | "documents";

export type FilingSettings = {
  defaultView: FilingView;
  /** How many days before a due date the reminder starts nudging (Phase 3). */
  leadDays: number;
  defaultCurrency: string;
  /** Opt-in daily digest push (Phase 5). Off until asked for. */
  pushEnabled: boolean;
  /** Local hour, 0-23, the digest is aimed at. */
  pushHour: number;
  /** Put retention dates in the calendar export as well as obligations. */
  icsIncludeRetention: boolean;
};

export const DEFAULT_FILING_SETTINGS: FilingSettings = {
  defaultView: "folders",
  leadDays: 30,
  defaultCurrency: "USD",
  pushEnabled: false,
  pushHour: 9,
  icsIncludeRetention: true,
};

export function normalizeSettings(raw: unknown): FilingSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_FILING_SETTINGS;
  const lead = typeof r.leadDays === "number" ? r.leadDays : Number(r.leadDays);
  const hour = typeof r.pushHour === "number" ? r.pushHour : Number(r.pushHour);
  return {
    defaultView: r.defaultView === "documents" ? "documents" : d.defaultView,
    leadDays: Number.isFinite(lead) ? Math.min(365, Math.max(0, lead)) : d.leadDays,
    defaultCurrency:
      typeof r.defaultCurrency === "string" && r.defaultCurrency.trim()
        ? r.defaultCurrency
        : d.defaultCurrency,
    pushEnabled: r.pushEnabled === true,
    pushHour: Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : d.pushHour,
    icsIncludeRetention: r.icsIncludeRetention !== false,
  };
}

/** Full-fidelity backup, re-importable (Phase 6). */
export type FilingBackup = {
  places: FilingPlace[];
  parties: FilingParty[];
  folders: FilingFolder[];
  documents: FilingDocument[];
  settings: FilingSettings;
};
