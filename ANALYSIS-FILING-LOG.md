# ANALYSIS — Filing Log ("Filing")

Design pass for a **fifth pillar**: a log of where physical paper lives, and what
that paper obliges you to do. Companion to `ANALYSIS-HOME-INVENTORY.md` and
`INVENTORY-ROADMAP.md`; defers to `CLAUDE.md` for the stack of record. No feature
code written yet.

_Owner decisions already taken are marked **[decided]**. Everything still open is
in §11._

## 1. What's being proposed

Two halves of one pillar:

- **Where the paper lives.** Which document, in which file folder, in which
  cabinet/drawer, at which location. Several locations (office, home, garage),
  and folders that belong to different people — family members **[decided]** or
  named clients **[decided]**.
- **What the paper obliges you to do.** Renew the licence, pay the invoice, renew
  the insurance, file the return, book the inspection — reminders attached to the
  paperwork itself.

The second half is what makes it a weekly habit rather than an annual chore, and
it is the half that no competitor pairs with the first (§3).

## 2. The honest fit question (read this first)

`ANALYSIS-HOME-INVENTORY.md` set the bar and then failed its own subject against
it. The north star is explicit:

> *Bookmarks feed the work · focus is the work · stats are the proof.*
> **Connection over breadth.**

A filing log is a **different domain** from focused work, exactly as My Stuff
was. It does not feed focus sessions. So it does not pass the north-star test as
written, and pretending otherwise would be a rationalisation.

What it does pass is a narrower, truer reading of what this app is for:

> Bookmark Deck's job is **retrieval** — *"where is the thing I need?"*.
> Bookmarks answer it for the digital world. Filing answers it for the physical
> one.

That is only worth anything if it is **concrete**, so it has to ship as a
feature, not a slogan: a document row links to the bookmark for the account it
belongs to, so the insurance policy in Drawer 2 and the insurer's login page are
one record (Phase 6). If that link gets cut for scope, the pillar loses its
justification and should be reconsidered.

**This is not household multi-user.** `ENGAGEMENT-ROADMAP.md` records that as
ruled out, and this does not reopen it. A *party* is a label on a folder —
"Mom's", "Client: Acme" — inside one owner's account. No second user ever signs
in, and no data is shared between accounts.

## 3. Market evidence — why this one is worth building

`ANALYSIS-HOME-INVENTORY.md` entered a crowded category (Sortly et al.). This one
does not. Researched across five product categories; the short version:

| Product | Price | Location a **tree**? | Paper-native? |
|---|---|---|---|
| **Paper Tiger** | ~$9/mo/seat | ❌ flat numbered slots | ✅ the only one |
| **Prisidio** | $9.99–11.99/mo | ❌ a *link*, not a tree | ⚠️ location-of-original only |
| Trustworthy · Everplans · IronClad | $120–189/yr | ❌ | ❌ digital vaults |
| Fold & File | $34.99–44.49/yr | ⚠️ | ⚠️ "cabinet" is a metaphor |
| Sortly · Homebox | free–$149/mo | ✅ / ✅✅ | ❌ no idea what a document is |
| paperless-ngx | free, self-host | ❌ *deliberately* | ⚠️ an integer written on the paper |
| Enterprise RFID (FileTrail, TAB) | **$5k–15k** deploy | ✅✅ | ✅✅ |

The signals that this is unmet demand rather than a solved problem:

- **The only purpose-built consumer product is Paper Tiger, from 1995.** Still
  selling, endorsed by ADDitude for ADHD paper management, and its 2026 reviews
  say the UI is *"too old and outdated"* with no built-in OCR. Nobody shipped the
  modern version.
- **Prisidio is the closest modern attempt and models location as a link.** It
  can say "the will is at the attorney's office"; it cannot say "the 2019 return
  is in Cabinet B, Drawer 2, green folder TAX-2019." That gap is the opening.
- **The state of the art in the technical community is an integer and a Sharpie.**
  paperless-ngx's Archive Serial Number is *"the identifier of the document in
  your physical document binders"* — write a number on the paper, binary-search a
  binder. Its own users are on GitHub asking how to mark paper *without damaging
  it*, answering each other with removable QR stickers.
- **Johnny.Decimal sells a course** whose central artifact, the JDex, is described
  as *"an index card drawer"* for your filing cabinet. A methodology with a paid
  course and no app is a textbook unmet need.
- **Mainstream advice is "keep a spreadsheet."** The best statement of the problem
  comes from one of those blogs: *"It doesn't matter where the insurance paper
  goes. It matters that you record your decision."*
- **Nothing pairs location with expiry reminders.** Some vaults do reminders
  (Burrotech's "Filing Cabinet"); the products with real location trees have no
  notion of a document that expires.

Two findings that should shape the build more than any feature list:

1. **Entry friction is what kills products in this category.** The consistent
   review complaint across the whole home-inventory band is that people give up
   after a few items. Capture speed is a feature, not polish.
2. **File-folder-shaped QR labels don't exist as a product.** Every label
   ecosystem is bin-shaped — and this repo already owns a label printer.

> **Research gap, stated rather than papered over:** Reddit was blocked at both
> the search and fetch layer during this research, so there is no community
> evidence from r/organization, r/adhd, r/declutter or r/homelab. That is the best
> source for how people actually fail at this. Gather it before writing any
> positioning copy. Several vendor pricing pages were also egress-blocked — treat
> the table above as directional, and re-check any figure before quoting it.

## 4. Does the architecture support it? Yes — better than inventory did

My Stuff had to invent its infrastructure. Filing inherits it:

| Need | Reuse |
|---|---|
| Auth/gating | next-auth session + Firebase Auth dual layer; **no second auth** |
| Per-user data | subcollections under `users/{uid}` — **zero `firestore.rules` change** (§9) |
| State pattern | the 5-part hook recipe from `useInventory` / `useWishlist` |
| Sync hook | the identical 46-line `useXSync` in all three pillars |
| Nestable tree | `buildTree`/`flattenTree` in `hooks/useInventoryLocations.ts` |
| QR labels | `lib/locationLabels.ts` + `lib/qr.ts` — printable label sheets, already built |
| Activity log | `lib/activity.ts` (pure helpers) + the `MAX_ACTIVITY = 300` append-and-trim in `useInventory.ts` + `@/lib/activityLog` |
| Check-out | `lib/lending.ts` — lend/return with due dates and overdue flags |
| Attachments | `lib/r2.ts` + `lib/uploadPhoto.ts`, with a compressed data-URL fallback |
| On-device OCR | `lib/ocrEngine.ts` (tesseract.js), camera already allowed by CSP |
| Attention panel | `components/AttentionPanel.tsx` — the exact due/overdue grouping needed |
| Nav badge | `hooks/useInventoryReminderCount.ts` — localStorage-only, shell-safe |
| Push | `web-push` + QStash + `public/sw.js`, shipped for timer and habit nudges |
| App lock | `hooks/useAppLock.ts` — PIN/biometric, device-local. Client files want this |
| UI primitives | `src/components/ui/` (Field, EmptyState, SectionLabel) + `cn()` |
| Billing | the Lemon Squeezy entitlement layer, built and dormant |

**Helpers are copied into the feature, not imported from inventory.** That is the
established house rule, stated in the code itself — `InventoryLocation` is
documented as *"same shape family as `src/types/folder.ts`, kept separate … so the
feature is removable."* Copying keeps both pillars one-folder extractions, which
`MYSTUFF-DECOUPLING-READINESS.md` shows is worth protecting.

### Why a separate pillar, not a `kind` on My Stuff

Considered and rejected:

- `InventoryItem` already carries ~50 fields and `ItemFormModal.tsx` is 1,848
  lines. A document kind adds retention, party, confidentiality and custody to a
  type already at its complexity ceiling.
- **Volume differs by an order of magnitude.** Items number in the hundreds;
  papers in the thousands. That forces different UI (dense list, not a photo grid)
  and different caching (§7).
- Client-file metadata has a different privacy posture from "things you own."
- "Filing" is a coherent standalone product; "a documents tab in My Stuff" is not.

## 5. Data model

Three ideas are borrowed from mature enterprise records systems because they cost
almost nothing here and are exactly where every consumer competitor is wrong:

1. **Home location vs current location.** A folder has a `homePlaceId` (where it
   lives) and a `currentPlaceId` (where it is). Checked-out is not a flag — it is
   `current !== home`. One comparison covers "Dad borrowed it", "it's on my desk"
   and "it's at the accountant's", and it is the digital form of the paper
   charge-out card file rooms have used for a century.
2. **Retention runs from a cutoff, not from when you filed it.** A folder covers a
   *date range*; the clock starts at the calendar-year-end of `coversThrough`. A
   box of 2024 invoices filed in March 2025 becomes shreddable on **2031-12-31**,
   not 2032-03-something. Consumer apps almost universally compute
   `created + N years` and get this wrong.
3. **A container inherits the longest retention of its contents.**
   `folder.destroyOn = max(documents.destroyOn)` — always. You cannot shred a
   folder because most of it has expired.

Everything else from that world — RFID, capacity planning, approval chains,
billing, pick lists, chain-of-custody attestation — is dropped.

### Collections (all under `users/{uid}/`)

| Collection | Holds |
|---|---|
| `filingPlaces/{id}` | the furniture: location → room → cabinet → drawer/shelf/box |
| `filingParties/{id}` | who a folder or paper belongs to |
| `filingFolders/{id}` | the file folder you physically pull out |
| `filingDocuments/{id}` | the paper |
| `filingDocs/{id}` | optional scans/photos, keyed by `documentId` |
| `filingSettings/settings` | defaults |

### Types (`src/features/filing/lib/types.ts`)

Pure declarations + label/icon consts — no React, no Firebase, mirroring
`features/inventory/lib/types.ts`.

```ts
export type PlaceKind = "site" | "room" | "cabinet" | "drawer" | "shelf" | "box" | "binder";

/** Nestable, exactly like InventoryLocation — its own subcollection, never shared. */
export type FilingPlace = {
  id: string;
  name: string;                  // "Garage", "Grey cabinet", "Drawer 2"
  parentId: string | null;
  kind?: PlaceKind;              // drives the icon + label wording
  note?: string;
  sortOrder?: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PartyKind = "self" | "family" | "client" | "business" | "other";

export type FilingParty = {
  id: string;
  name: string;                  // "Mom", "Client: Acme Ltd"
  kind: PartyKind;
  color?: string;                // folder-tab colour, from a fixed safe palette
  note?: string;
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** ~18 presets ("Tax returns — 7 years", "Deeds & titles — permanent"); users
 *  pick one rather than authoring a schedule. */
export type RetentionAction = "shred" | "archive" | "review" | "permanent";

export type RetentionRule = {
  id: string;
  label: string;
  action: RetentionAction;
  keepYears?: number;            // undefined when action === "permanent"
  trigger: "fixed" | "event";    // "event" waits for eventDate, then adds keepYears
  triggerEvent?: string;         // "when the car is sold"
  note?: string;                 // "IRS keeps 6 years for under-reported income"
};

export type FilingFolder = {
  id: string;
  name: string;                  // "Vehicles", "2024 Taxes"
  homePlaceId: string | null;    // where it lives
  currentPlaceId: string | null; // where it is now — differs ⇒ checked out
  parentId: string | null;       // manila file inside a hanging folder
  partyId?: string | null;
  category?: string;             // free text; suggestions derived from existing
  tabColor?: string;
  aliases: string[];             // "Car" / "Auto" / "Taurus" all find this folder
  tags: string[];
  retentionRuleId?: string | null;   // inherited by its documents unless overridden
  coversFrom?: string;               // YYYY-MM-DD
  coversThrough?: string;            // YYYY-MM-DD — the cutoff runs off THIS
  eventDate?: string | null;         // set when an "event" trigger happens
  overrideDestroyOn?: string | null;
  keepReason?: string | null;        // consumer form of a legal hold: mutes the
                                     // reminder, never resets the clock
  heldBy?: string | null;            // only meaningful when current !== home
  takenAt?: string | null;
  dueBack?: string | null;
  note?: string;
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DocType =
  | "id" | "tax" | "financial" | "property" | "vehicle" | "insurance"
  | "medical" | "legal" | "education" | "employment" | "warranty"
  | "correspondence" | "pet" | "other";

/** A dated thing a paper obliges you to DO. Embedded on the document (like
 *  inventory's `activity[]`) rather than given its own collection: a document has
 *  one to three of these, and the "what's coming up" view already holds every
 *  document in memory. */
export type ObligationKind = "renew" | "expires" | "pay" | "file" | "inspect";
export type Recurrence = "none" | "monthly" | "quarterly" | "yearly" | "custom";

export type Obligation = {
  id: string;
  kind: ObligationKind;
  dueOn: string;                 // YYYY-MM-DD
  label?: string;                // "Premium — Q3", "Emissions test"
  amount?: number;               // "pay" only
  currency?: string;
  repeat?: Recurrence;
  repeatMonths?: number;         // when repeat === "custom"
  leadDays?: number;             // nudge this early; default from settings (30)
  completedOn?: string | null;   // paid/renewed on — a repeat rolls to the next
  archived?: boolean;
};

export type FilingDocument = {
  id: string;
  title: string;                 // "2023 Form 1040"
  folderId: string | null;       // null = the Unfiled inbox
  partyId?: string | null;       // defaults to the folder's party
  docType?: DocType;
  docDate?: string;              // the date on the paper
  filedAt?: string;              // when you put it away
  isOriginal?: boolean;          // the legally-significant copy
  copies?: number;
  confidential?: boolean;        // gated behind the app lock
  retentionRuleId?: string | null;
  overrideDestroyOn?: string | null;
  obligations: Obligation[];
  nextDueOn?: string | null;     // DERIVED cache of the earliest open obligation
  reference?: string;            // policy no., account no., case no.
  aliases: string[];
  tags: string[];
  note?: string;
  bookmarkLink?: { id: string; title: string; url: string } | null; // §2, the thesis
  hasAttachment?: boolean;       // slim flag; the blob lives in filingDocs
  activity?: FilingActivity[];   // capped at 300, same as inventory
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FilingActivityType =
  | "filed" | "moved" | "taken" | "returned"
  | "renewed" | "paid" | "reviewed" | "shredded" | "copied" | "note";
```

### Derived dates — never stored stale

`lib/retention.ts` and `lib/obligations.ts`, both pure, both with Vitest siblings
(inventory has 28 such `lib/foo.ts` + `lib/foo.test.ts` pairs):

```
cutoff        = calendar-year-end of (coversThrough ?? docDate ?? filedAt)
computed      = trigger === "event"
                  ? (eventDate ? eventDate + keepYears : null)   // null until posted
                  : cutoff + keepYears
effective     = overrideDestroyOn ?? computed                    // null ⇒ permanent
folder.destroyOn = max(children.effective)                       // never the min

nextDueOn     = min(obligations.filter(open).dueOn)              // recomputed on
                                                                 // EVERY mutation
```

Destruction is a **review queue with a receipt** — mark shredded, log the activity
— never an automatic delete. A `keepReason` mutes the reminder without touching
the clock.

## 6. Reminders — the half that earns the habit

- **Obligations hang off documents, not free-floating.** The licence *document*
  carries its renew-by date; the record you want in front of you when the reminder
  fires is the paper's location. Free-standing to-dos with no paper behind them
  stay in Focus's todo list — that boundary keeps the two pillars from competing.
- **Repeats roll forward on completion**, stamping `completedOn` and logging a
  `renewed`/`paid` activity. Same auto-rolling behaviour already shipped for My
  Stuff's digital subscriptions. An obligation left unpaid for three months rolls
  **once** and reads overdue; it must not silently skip ahead.
- **One Attention surface, two sections** — obligations due and papers now
  shreddable — grouped **Overdue · This week · This month · Later**. Modelled on
  `AttentionPanel.tsx`, which already does this for warranties and use-by dates.
- **Nav badge** via `useFilingReminderCount`, reading **only** localStorage — the
  same constraint `useInventoryReminderCount` follows so the shared shell never
  pulls Firebase into its bundle.
- **Push reuses the shipped path.** A filing reminder is another payload on
  web-push + QStash, not new infrastructure.
- **Calendar export (`.ics`)** — a pure builder with a test, so deadlines can be
  subscribed to in Google/Apple Calendar. Cheap, and it meets people where they
  already look.

## 7. Scale — decided up front, not at 5,000 documents

Every other pillar caches its whole collection in `localStorage` and subscribes
with one `onSnapshot`. At a few thousand documents that approaches the ~5 MB quota
and makes the first snapshot slow.

**v1:** places, parties and folders are the hot tier — subscribed and cached whole
(hundreds of records at most). Documents are subscribed whole but **cached slim**:
the localStorage projection stores only
`{id, title, folderId, partyId, docType, docDate, nextDueOn, tags}`. `nextDueOn`
is in there specifically so the badge and Upcoming panel work offline without
loading full obligation arrays. Notes, references, obligations and activity load
from Firestore on open.

`data/filingData.ts` ships `subscribeDocuments(folderId?)` **from day one**, so
switching to per-folder lazy loading past a documented threshold is a one-line
change — following the bounded listener Habits already uses
(`where("day", ">=", cutoff)`).

## 8. Module layout

```
src/features/filing/
  FIRESTORE_RULES.md              # collections + "no rule change needed" + Removability
  lib/types.ts                    # the model above + label/icon consts
  lib/tree.ts       (+ .test.ts)  # buildTree / flattenTree, copied from inventory
  lib/retention.ts  (+ .test.ts)  # destroyOn, dueForReview, shred list
  lib/obligations.ts(+ .test.ts)  # nextDueOn, rollForward, bucketing, presets
  lib/ics.ts        (+ .test.ts)  # calendar feed
  lib/filingSearch.ts(+ .test.ts) # haystack search, modelled on inventorySearch.ts
  lib/breadcrumb.ts (+ .test.ts)  # place path → "Garage › Cabinet › Drawer 2"
  lib/labels.ts     (+ .test.ts)  # printable QR labels, copied from locationLabels.ts
  lib/qr.ts                       # dynamic-import wrapper, copied
  lib/exportFiling.ts(+ .test.ts) # CSV/JSON export + merge-safe import
  data/filingData.ts              # the only file importing firebase/firestore here
  hooks/useFilingSync.ts          # the identical 46-line sync hook
  hooks/{useFilingPlaces,useFilingParties,useFilingFolders,useFilingDocuments,
         useFilingSettings,useFilingReminderCount}.ts
  components/FilingDashboard.tsx  # the entry point
  components/{PlaceManager,PartyManager,FolderList,FolderDetailModal,
              DocumentFormModal,DocumentDetailModal,WhereIsPaperModal,
              UpcomingPanel,RetentionPanel,CustodyLedgerModal,LabelPrintModal,
              UnfiledInbox}.tsx
```

`src/app/(app)/filing/page.tsx` — the same 15-line auth gate as
`src/app/(app)/inventory/page.tsx`.

New components are built on `src/components/ui/` from their first commit.

### Shared-file touches — additive only, one line each

| File | Change |
|---|---|
| `src/components/AppShell.tsx` | one `DESTINATIONS` entry (+ a `short` label, §12) |
| `src/components/icons.tsx` | one new icon (`Cabinet`) |
| `src/components/AppShellHost.tsx` | one `navBadges` key |
| `src/components/CommandPalette.tsx` | nav + "File a paper" entries |
| `src/lib/activityLog.ts` | new `ActivityType` members |
| `src/app/(app)/guide/page.tsx` | one `SECTIONS` block |
| `CLAUDE.md` / `README.md` | pillar documented |

Plus one route handler under `src/app/api/filing/` for the scheduled push payload,
importing only from `features/filing/lib/*` so it ports with the feature — the
same shape as `src/app/api/inventory/*`.

**Naming:** pillar **"Filing"**, route `/filing`, collections `filing*`, tagline
*"Where every paper lives — and what's due next."*

## 9. Security rules

Every collection sits under `users/{uid}/`, so the existing recursive owner rule in
`firestore.rules` already covers it — **no rule change required.** The feature's
`FIRESTORE_RULES.md` documents the collections and confirms this, mirroring
`src/features/inventory/FIRESTORE_RULES.md`.

Two carve-outs worth stating there:

- The **app lock** stays device-local (`localStorage`), exactly as inventory's does.
  A lock belongs on the device, not in the cloud. Don't "sync" it later.
- `confidential` on a document is a **UI gate behind that lock**, not a security
  boundary. Firestore sees one owner; anyone with the account sees everything.
  Say so plainly in the guide — especially given client files.

## 10. Phase roadmap

Each phase is one PR: additive, verified (`typecheck` + `test` + `build`), merged
before the next.

| Phase | Ships | Why here |
|---|---|---|
| 1 | Types, data layer, sync, route, dashboard; places/parties/folders/documents CRUD, search, breadcrumb | The skeleton; nothing to demo without it |
| 2 | **Retrieval**: QR labels, ⌘K entries, "Where is this paper?", Unfiled inbox | The product's actual promise (§3) |
| 3 | **Reminders**: obligations, `nextDueOn`, Upcoming panel, nav badge, repeat roll-forward, presets | Deliberately before retention — this is the half with a weekly reason to open the app |
| 4 | **Stewardship**: retention/shred queue folded into the same panel, custody ledger, activity timeline | Reuses Phase 3's surface rather than building a second one. **Shipped** — 22 retention presets in `lib/retention.ts`, custody in `lib/custody.ts` |
| 5 | **Reach**: scheduled push, `.ics` calendar export | Distribution, once there's something to remind about. **Shipped** — a daily digest rather than per-obligation alarms, because `/api/push/schedule` caps QStash delays at 24h; the `.ics` is an import file, not a subscribable feed (that would mean a publicly-fetchable URL carrying private paperwork) |
| 6 | **Connections**: bookmark ↔ document link, CSV/JSON export + import, `/guide` section | The §2 thesis. Not optional. **Shipped** — the link reads the core bookmarks cache (a one-way dependency, not a second subscription); import merges by id and never deletes. **R2 attachments shipped separately** (see the attachments note in `CLAUDE.md`): index-first still stands — a scan is optional, loaded per document on open, and the whole surface hides itself when R2 isn't configured |

### Cut regardless

RFID · barcode inventory of every sheet · full-text OCR search over scans ·
multi-user sharing · e-signature · document versioning · cloud-drive sync ·
"AI file everything for me" · storage-unit rental integrations.

## 11. Open decisions (gating)

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Bottom nav at six cells.** `AppShell.tsx` renders every destination + ⌘K, each `flex-1`. A fifth pillar makes six cells (~53px at 320px) and the obvious mitigations are already applied — labels are `text-[10px]`, `px-0.5`, `truncate` — so "Bookmarks"/"My Stuff" will clip | Add an optional `short` field used only by the bottom nav: *Saved · Focus · Habits · Stuff · Filing · Search*. Confirm with a 320px screenshot before merging the nav entry |
| 2 | ~~**Retention preset content**~~ | **Settled in Phase 4.** 22 presets in `lib/retention.ts`, sourced from the IRS periods of limitations (3/6/7 years and the no-limit case), the FLSA/ADEA employment floors (3/2/1 years) and the HIPAA 6-year documentation rule — which is deliberately kept distinct from clinical records, where state law governs and HIPAA sets no period. Every preset carries a note saying what its number is based on, and both surfaces show a "general guidance, not legal or tax advice" line |
| 3 | **Renewal cadence presets** — passport, licence, registration, inspection, estimated-tax quarters | Jurisdiction-specific. Ship defaults and let users edit; don't pretend to be authoritative |
| 4 | **Is reminder push free or metered?** | In-app panel, badge and `.ics` free; scheduled push follows whatever gating push already has, since it carries real marginal cost |
| 5 | **Attachments in v1** | **[decided]** index-first: optional photo/PDF per document via the existing R2 pipeline, never required |
| 6 | **Does Filing get its own paid tier?** | Defer. The Lemon Squeezy layer is dormant; decide once the pillar has users |

## 12. Effort & risks

**Effort:** Phases 1–2 are the real build (~the size of inventory Phase 1).
Phases 3–6 are each a slice. Most of the hard infrastructure is inherited (§4),
so the cost is domain modelling and UI, not plumbing.

**Risks:**

- *Product dilution* — the honest one. This is the fifth pillar in an app whose
  motto is "connection over breadth." Mitigated only by shipping the bookmark ↔
  document link (§2); if that gets cut, the justification goes with it.
- *Entry friction* — the category killer (§3). A paper must be filable in one
  screen with title + folder, everything else optional, and an Unfiled inbox that
  accepts a title and nothing more. Treat capture speed as a hard requirement.
- *Scale* — 5,000 documents is a real user, not a stress test. §7 is the answer;
  seed ~2,000 records and measure first paint and localStorage footprint before
  Phase 2 ships.
- *Privacy expectations around client files* — see §9. A solo practitioner may
  assume more isolation than Firestore gives. Be explicit in the guide.
- *Maintenance surface* — five more collections, another export/import path,
  another backup story.
- *Positioning built on incomplete research* — §3's Reddit gap. Fix before any
  marketing copy.

## 13. Recommendation

**Build it, as an isolated pillar under `src/features/filing/`, following the
same rules that make My Stuff a one-folder extraction.**

It is the rare case where the market evidence is stronger than the north-star fit:
a category whose only purpose-built consumer product is thirty years old, whose
best modern attempt can't express a drawer, and whose most-deployed solution is a
number written on paper with a Sharpie. The infrastructure is already paid for.

Two conditions on that recommendation, and they are not decoration:

1. **The bookmark ↔ document link ships** (Phase 6). It is what makes this a
   pillar of *this* app rather than a different app wearing its shell.
2. **Capture stays fast.** Every product in this category dies of entry friction.
   If filing a paper ever takes more than one screen, the feature has failed
   regardless of how good the retrieval is.

Design the data layer so extraction stays cheap — own collections, own folder, no
imports from other features — and Filing can become its own app the day it earns
one.
