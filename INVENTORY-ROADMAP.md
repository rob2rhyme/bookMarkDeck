# INVENTORY-ROADMAP.md — "My Stuff" home-inventory pillar

Planning doc for adding a home-inventory feature to Bookmark Deck. Companion to
`FOCUS-INTEGRATION.md`. **This is a roadmap, not a commitment** — Phase 1 is the
near-term, on-brand build; Phases 2–4 + the commercialization track are a
deliberate, separately-funded decision (see §6).

Status: **Phase 1 core scaffold shipped** (PR #159 — items, nested locations,
lending, value dashboard, attention panel, grid/list, search, CSV/JSON
export/import, URL photos). **Block-A near-complete** (PRs #160–#167 + this
cycle): retrieval, lending ledger, warranty/maintenance reminders + nav badge,
Focus-project links, declutter→habits, barcode capture, and value/depreciation
curves are all shipped — only **kits/collections** and **insurance PDF export**
remain in A. Photo storage + product enrichment (B) tracked below.

---

## ⭐ Next-up plan (recommended approach — research pass 2026-07-13)

Deep-research conclusions (multi-source, pricing independently verified — full
detail in `ANALYSIS-PHOTO-STORAGE.md`):

### Storage decision: Cloudflare R2, not Firebase Storage

**Photos go to Cloudflare R2 + Cloudflare Images Transformations.** This
**removes the Blaze prerequisite** (§6.1) — Firestore + Firebase Auth stay on
the free Spark plan; only the R2 object key is stored on the item. Free
egress + 10 GB free storage + 5,000 free unique transforms/mo ≈ $0/mo at this
app's scale. Uploads authorize through a Next.js presign route (session +
Firebase ID-token verify), keys server-composed as
`users/{uid}/inventory/{itemId}/{photoId}.webp`. Runner-up: Supabase Storage;
honorable mention: Backblaze B2 + Cloudflare. See the analysis doc for the
size-cap gotcha and the migration path from the current `ItemPhoto` shape.

### Build order

**A — ship soon (on-brand, no paid infra), in priority order:**
1. ✅ **Link item → its online life** — attach a bookmark (product page, manual,
   warranty registration) to any item. *The thesis made literal; no competitor
   connects items to a personal bookmark library.* (shipped: `links[]` on items,
   read-only bookmark picker, card chips)
2. ✅ **Seconds-to-add capture** — name-only add; every other field folded under
   "Add details". Kills the #1 abandonment driver ("ten fields = never").
3. ✅ **"Where is it?" retrieval** — forgiving fuzzy find returning the
   container/location first. (PR #162 — `whereIs` + location breadcrumb,
   `WhereIsModal`, lent/unassigned fallbacks.)
4. ✅ **Lending ledger view** — calm "who has my stuff / due back when" surface
   over the fields already stored. (PR #163 — `lendingLedger`, "On loan" modal,
   `markReturned`.)
5. ✅ **Warranty & maintenance reminders** — Attention panel + nav badge. (PR
   #164 — `maintenanceDate`, `maintenanceOverdue/Soon` buckets, `reminderCount`,
   amber My-Stuff nav badge. In-app only; push-when-closed stays a P2 Cloud
   Function, deliberately not faked.)
6. ✅ **Duplicate-purchase guard** — "do I already own this?" nudge while naming
   a new item.
7. ✅ **Link item → Focus project** — connective tissue across pillars. (PR #165
   — `projectName`, read-only `useFocusProjects`, form datalist + card chip;
   also fixed a maintenance/project export round-trip gap.)
8. ✅ **Declutter companion** — keep/donate/sell tagging wired into habits. (PR
   #166 — `disposition`/`releasedDate`, `DeclutterModal`, `releaseItem`, and a
   `declutter` habits `TrackableSource` that counts items released today.)
9. ✅ **Barcode quick-add** — client `BarcodeDetector`, manual fallback (capture
   only). (PR #167 — `BarcodeScanner`, `useBarcodeSupported`, Barcode field.
   *Product lookup shipped separately as a B item — see below.*)
10. **Kits / collections** _(todo)_, **insurance PDF export** (client-side)
    _(todo)_, ✅ **value & depreciation curves** (pure math in `lib/value.ts` —
    straight-line/category-aware resale estimate + 5-year curve in the value
    panel; PR-B this cycle).

**B — worth it, needs the storage decision (now R2, not Blaze):** native
camera capture + client compression (the keystone); receipt/document
attachments; on-device receipt OCR (privacy-safe); UPC/product enrichment
(proxied, metered); AI photo auto-fill only ever as billing-gated premium.

**C — skip (off-brand):** social/public shelves, home-finance dashboards,
insurance RCV/ACV mode, household multi-user (deliberate "not now"), full
inbox receipt import, QR label printing, GPS photo tagging.

---

## 0. Thesis & framing

Bookmark Deck is drifting from "bookmarks app" toward a **calm personal life
hub** (focus, habits, journal, meditation, hydration). A **"My Stuff"** pillar —
what you own, where it is, what's under warranty, what you've lent out — fits
that arc. Frame it as *personal organization*, **not** an insurance-grade SaaS;
the calm/personal brand is the differentiator and shouldn't be diluted.

Build it like `features/focus`: **fully self-contained under
`src/features/inventory/` + an `/inventory` route, client-side Firestore,
removable cleanly.**

The honest split, established up front:
- The features that are **cheap to build** reuse what we already have.
- The features that make it **pay-worthy** (AI capture, insurance, household,
  and the billing to charge for them) are net-new infrastructure with recurring
  cost — and one research idea (E2E/local-first) *conflicts* with server-side
  AI. Don't try to ship the whole competitive thesis as a bolt-on.

---

## 1. Phase roadmap

| Phase | Theme | Features | Hard dependency | Reuses | Pay-worthy? |
|---|---|---|---|---|---|
| **1** | **Personal catalog** | Items, multi-photo, nested locations, tags, purchase/warranty fields, lending, value dashboard, in-app "attention" panel, CSV/JSON export, barcode quick-add | **Firebase Storage + Blaze plan** | folders→locations, `Modal`, `SectionNav`, `AnalysisPanel` charts, `exportFocus` pattern, push infra | Free pillar |
| **2** | **Intelligence & retrieval** | AI photo→multi-item capture, voice add, receipt-forward→auto-create, NL search, per-item AI Q&A (cached to item), photo-to-find, UPC/EAN enrichment | LLM+vision API (cost metering), paid UPC DB, **scheduled Cloud Function** for warranty push | P1 image pipeline, activity log | ✅ **primary** |
| **3** | **Protection & sharing** | Insurance mode (RCV/ACV, comparable pricing), carrier-format schedule-of-loss PDF, coverage-gap estimate, evidentiary GPS/timestamp, **household multi-user** (shared collection, roles, activity) | Firestore **multi-owner data model + security-rules rewrite**, PDF lib, legal/disclaimers | Storage metadata, Modal/forms | ✅ **primary** |
| **4** | **Lifecycle & ecosystem** | "Things to sell" + AI listings + shareable micro-sites, wishlist, maintenance calendar, fixed-asset/whole-home pillar + replacement-cost forecasts, API/webhooks, Encircle/Sortly migration importers, pro/affiliate channel | public page rendering, API surface, partner deals | reminders, charts, export | ⚠️ retention + channel |
| **C** | **Commercialization** *(parallel from P2)* | Stripe billing, tiers, quota metering, entitlement gates, account/data-deletion controls, ToS + insurance disclaimers, PWA install + offline polish | **Stripe + entitlement layer** | next-auth session, settings pattern | The thing that lets us charge |

### Sequencing logic
- **Storage (P1) is the keystone** — nothing visual or AI works without it, and
  it forces the Blaze decision everything downstream also needs. Decide once.
- **Track C runs in parallel from the start of P2**, not at the end — the moment
  AI adds variable cost, it must be gated by quotas/billing. Never ship AI ungated.
- **P2 before P3** — AI capture is what makes the catalog complete enough to be
  worth insuring/sharing. Reports on a half-empty manual inventory have little value.
- **Household (P3)** is the biggest fork: it converts the data model from
  single-owner (`users/{uid}`) to shared-resource. Doing it after P1/P2 stabilize
  avoids a worse migration later.
- **P4 is retention/moat, not acquisition** — build once paying users ask.

### Cut regardless
E2E/local-first (conflicts with server-side AI, huge cost), native iOS/Android
(stay PWA/web), HomeZada-style whole-home finance/Plaid (overwhelm — the thing
to beat, not copy).

---

## 2. Phase-1 design spec ("My Stuff")

### 2.1 Scope / non-goals
**In:** items + photos, nested locations, categories/tags, purchase + warranty
fields, lending fields, value dashboard, premium grid/shelf/detail UI, in-app
reminders, CSV/JSON export, optional barcode quick-add.
**Deferred:** everything in Phases 2–4 + billing + push-when-closed.

### 2.2 Module layout (mirror `features/focus`)
```
src/features/inventory/
  data/inventoryData.ts        # Firestore + Storage (mirrors focusData.ts)
  hooks/useInventory.ts        # owns items, localStorage cache, onSnapshot reflect
  hooks/useInventoryLocations.ts
  hooks/useInventorySettings.ts
  lib/types.ts                 # InventoryItem, Location, …
  lib/image.ts                 # client-side compression (canvas → WebP)
  lib/value.ts                 # pure value/rollup math (unit-tested)
  lib/exportInventory.ts       # CSV/JSON (mirrors exportFocus.ts)
  components/InventoryDashboard.tsx + ItemCard/ItemGrid/ShelfView
  components/ItemDetailModal/ItemEditModal/PhotoLightbox/LocationTree/ValuePanel/AttentionPanel
  FIRESTORE_RULES.md
src/app/(app)/inventory/page.tsx   # auth-gated, copies focus/page.tsx
```

### 2.3 Data model (one doc per record, like `focusTasks`)
Images live in **Storage**, not Firestore — items hold only photo *metadata*, so
docs stay well under the 1MB limit.
```
users/{uid}/inventoryItems/{itemId}
users/{uid}/inventoryLocations/{locationId}
users/{uid}/inventorySettings/settings
```
```ts
type InventoryItem = {
  id: string; name: string; description?: string;
  locationId: string | null; category?: string; tags: string[];
  quantity: number;
  purchaseDate?: string; price?: number; currency?: string; retailer?: string;
  manufacturer?: string; model?: string; serial?: string;
  warrantyExpiry?: string;        // → Attention panel
  condition?: "new" | "good" | "fair" | "poor";
  value?: number;                 // manual current-value estimate (P1)
  notes?: string;
  lentTo?: string | null; lentDate?: string | null; dueDate?: string | null;
  photos: { id: string; path: string; w?: number; h?: number }[];
  archived?: boolean; createdAt: string | null; updatedAt: string | null;
};
type Location = { id; name; parentId: string|null; sortOrder?; createdAt?; updatedAt? }; // == src/types/folder.ts
type InventorySettings = { defaultCurrency: string; defaultView: "grid"|"shelf"|"list" };
```
- **Separate `inventoryLocations`, not reuse of `folders[]`** (which belongs to
  bookmarks) — keeps the feature removable. Mirrors the `Folder` shape so nesting
  logic is copy-adaptable.
- **Scaling:** follow the focus pattern (subscribe-all + filter client-side).
  Correct for hundreds–low-thousands of items; revisit with server-side
  `where`/`orderBy` + `firestore.indexes.json` only past ~5k.

### 2.4 Photo-storage decision
**Superseded (2026-07-13): use Cloudflare R2 — see the Next-up plan above and
`ANALYSIS-PHOTO-STORAGE.md`.** Original Phase-1 reasoning kept for the record:

**Use Firebase Storage** (Option A). It ships inside the already-installed
`firebase@^12` SDK (**zero new dependency**), reuses the same `uid` from
`ensureFirebaseGoogleAuth`, keeps uploads **client-side**, and needs only console
enablement + a `storage.rules` file. (Rejected: base64-in-Firestore — 1MB cap;
URL-only — defeats "photograph your stuff." Deferred: R2/S3 — a P2 cost
optimization.)

**Two prerequisites:**
1. **Blaze plan** — Firebase Storage requires pay-as-you-go in practice. Same
   gate as any later phase, so deciding now is fine — but it *is* required and
   real (small, usage-based) cost begins.
2. **Compress on the client, always** (`lib/image.ts`): downscale to ~1600px
   long edge, re-encode WebP/JPEG ~0.8 via `<canvas>`. Turns a 4MB phone photo
   into ~150–300KB — the biggest lever on both storage and bandwidth cost.

Layout + pipeline:
```
gs://…/users/{uid}/inventory/{itemId}/{photoId}.webp
```
capture/pick → compress → `uploadBytes` → store `{id,path,w,h}` on the item →
render via `getDownloadURL` (cache the URL). Deleting an item deletes its prefix.

### 2.5 Security rules
- **Firestore: no change.** The existing recursive owner rule
  (`match /users/{uid}/{document=**}`) already covers the new subcollections.
- **Storage: new ruleset** (separate from Firestore). Add `storage.rules` + wire
  `firebase.json`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.size < 8 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### 2.6 Component reuse map
| New piece | Reuses |
|---|---|
| `InventoryDashboard` section jumps | `SectionNav` |
| Item detail/edit, photo lightbox | `Modal.tsx` |
| `LocationTree` collapse | `ExpandToggle.tsx` |
| `ValuePanel` charts | `AnalysisPanel.tsx` SVG idiom |
| `/inventory` nav entry | `AppShell` nav array (additive one-liner, like `/focus`) |
| New glyphs (Box/Package/Tag) | `icons.tsx` (additive) |
| Export | `exportFocus.ts` / `FocusBackup` pattern |
| Reminders surfacing | `notify.ts` (in-app) |
| Auth-gated route | copy `focus/page.tsx` |
| Cards/chips/dark theme | existing Tailwind tokens |
| Barcode quick-add | browser `BarcodeDetector` (feature-detect; Safari → manual fallback) |

**Shared-file touches (additive, smallest-diff):** `AppShell.tsx` (one nav
entry), `icons.tsx` (a few glyphs), optionally the focus `ActivityType` union
(`inventory_added`, `item_lent`) to surface inventory in the unified timeline.

### 2.7 Reminders (be honest about the limit)
Warranty/lending due-dates are months out, so the existing minute-scale
`schedulePush` isn't the tool. **P1:** compute upcoming items client-side on load
→ `AttentionPanel` + nav badge (zero new infra). **Push-when-app-closed** needs a
daily scheduled Cloud Function — that's **P2** (Blaze + Functions). Flag it,
don't fake it.

### 2.8 Phase-1 effort
| Block | Effort |
|---|---|
| Data layer + hooks + types | 2–3 d |
| Item CRUD + locations + modals | 3–4 d |
| Photo storage (enable, rules, compression, pipeline) | 3–4 d |
| Views + value dashboard + attention panel | 3–4 d |
| Export, barcode, polish, tests (`value.ts`/`image.ts`) | 2–3 d |
| **Total** | **~2.5–3.5 weeks** |

---

## 3. Premium/modern layout notes
Grid/gallery default (photo-forward cards + value/location chips), shelf view
grouped by location, detail modal with photo carousel + warranty countdown, value
dashboard (value-by-category/room) reusing the `AnalysisPanel` charts,
`SectionNav` to jump rooms, "fast now, detailed later" capture (never block on
full entry). All in the existing dark-slate Tailwind language — no new design
foundation.

---

## 4. Monetization reality
Users pay almost exclusively for (a) AI capture removing tedium, (b) insurance
peace-of-mind, (c) household sharing, (d) unlimited storage — all P2/P3 + Track C.
A free P1 pillar is feasible and nice but **won't itself command payment**. "Pay-
worthy" and "cheap reuse" are different feature sets; be clear-eyed about that.

---

## 5. Go-to-market signals (if Phase 2+ is pursued)
- **Encircle refugees** — their free consumer product is gone; a one-click
  importer targets stranded users.
- **The ~53% with no inventory** — barrier is effort; lead with "video your
  house, done in minutes" (an AI-capture, i.e. P2, message).
- **III/KnowYourStuff trust gap** — co-branded insurer/agent channel (P3/P4).

---

## 6. Open decisions (gating)
1. **Enable Blaze plan?** ~~Hard prerequisite for Storage~~ **Resolved
   (2026-07-13): no.** Photos go to Cloudflare R2 (see the Next-up plan);
   Firebase stays on Spark. Blaze only returns if a later phase needs Cloud
   Functions.
2. **Currency:** single default (recommended for P1) vs per-item.
3. **Activity-timeline integration:** add inventory events to the shared
   `ActivityType` union (recommended — cheap, enriches the log) vs keep local.
4. **Brand framing:** ship as **"My Stuff"** (personal, on-brand) rather than
   "Home Inventory" (insurance-SaaS connotation).
5. **The big one — P1→P2 boundary is a go/no-go** on "are we building a paid
   inventory SaaS," not a default continuation.

---

*Competitive research that informed this lives in the working notes
(`home-inventory-app-research.md`); summarized here so the repo carries the plan,
not the raw research.*
