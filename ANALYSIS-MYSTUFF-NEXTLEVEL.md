# ANALYSIS — "My Stuff" next level

Synthesis of the competitive research (`home-inventory-app-research.md`: NestEgg,
Sortly, Encircle, HomeZada, Itemtopia, Scanlily/ShelfLily, Spullio, +niche)
against what **My Stuff** already ships, and a next-level plan **filtered through
this app's brand** — *calm, private, connection over breadth.* Companion to
`INVENTORY-ROADMAP.md`.

## The one strategic call

The research's "winning wedge" is **AI multi-modal capture + household + insurance
RCV/ACV + whole-home finance**. Most of that is a **cost/privacy war** (cloud
vision per scan, insurance-SaaS surface, multi-owner data model) that this app
should **not** fight — it's exactly the breadth the roadmap warns against.

My Stuff's real differentiator is the thing **no competitor has**: it's one
pillar of a *connected personal hub* — items link to **bookmarks** (the manual,
the product page), to **Focus projects**, and feed the **activity timeline** and
**habits** (declutter). Plus it's **local-first, private, generous-free** — the
opposite of the stingy-cap, cloud-only incumbents. **Next level = deepen
connection + calm, not chase AI/insurance parity.**

## What My Stuff already ships (compiled)

**Capture & items** — name-first quick add ("fast now, detailed later"); full
fields (category, tags, quantity, purchase date/price/currency, retailer, maker,
model, serial, **barcode**, warranty, **maintenance date**, condition, value,
notes); **barcode camera scan on all browsers** (native + ZXing-WASM ponyfill) →
**UPC product lookup autofill**; **on-device receipt OCR** prefill; duplicate-
purchase guard.

**Media** — **multi-photo per item** (cover + carousel + full-screen lightbox);
**receipts/manuals/warranty attachments** (per-item subcollection); **Cloudflare
R2** storage path (feature-gated) with orphan cleanup; photo-by-URL.

**Organize & find** — **nested locations** (rooms/shelves/boxes); **grid / list /
shelf** views; **"Where is it?"** forgiving fuzzy retrieval with location
breadcrumb; **collections / kits**; search across every field + link.

**Value & care** — value dashboard (total, by category, by location) + **resale/
depreciation** estimate; **Attention** panel (warranty + maintenance + overdue
returns) with a **nav badge**; **lending ledger** (who/when/returned).

**Lifecycle** — **declutter** (keep/donate/sell/toss) wired into **habits**;
archive; **insurance PDF** export.

**Data & sync** — **local-first** + **real-time Firestore sync** + explicit
sync buttons; **CSV + JSON export**, merge-by-id **import** (no lock-in);
per-user private.

**Connection (unique)** — item ⇄ **bookmark** links; item ⇄ **Focus project**;
**activity timeline** events (added/lent/returned/released).

## Benchmark vs the field

| Capability | Field leader | My Stuff | Read |
|---|---|---|---|
| Barcode/UPC lookup | Itemtopia (600M) | ✅ scan + lookup | at parity |
| Multi-photo per item | NestEgg (10) | ✅ (8) | at parity |
| Attachments (receipts/manuals) | most | ✅ | at parity |
| Nested locations | Sortly/NestEgg | ✅ | at parity |
| Warranty **+ maintenance** alerts | HomeZada | ✅ (+ nav badge) | at parity |
| **Lending tracker** | Spullio | ✅ ledger | **ahead of most** |
| Grid/shelf/gallery views | — | ✅ grid/list/shelf | at parity |
| No-lock-in export | Scanlily | ✅ CSV/JSON | at parity |
| Real-time cross-device sync | Sortly | ✅ (Firestore live) | at parity |
| **Privacy / on-device** | NestEgg | ✅ local-first + on-device OCR/scan | **ahead** |
| **Generous free tier** | Spullio/Scanlily | ✅ unlimited free | **ahead** |
| **Cross-pillar connection** | *none* | ✅ bookmarks/focus/habits | **unique** |
| AI photo→item recognition | Scanlily/Itemtopia | ❌ | gap (gated) |
| AI video capture | Scanlily | ❌ | gap (gated) |
| NL search / ask-AI | Itemtopia | ⚠️ fuzzy find | partial |
| Photo-to-find | Scanlily | ❌ | gap (gated) |
| QR labels (print/scan) | NestEgg/Scanlily | ❌ | **gap (on-brand!)** |
| Maintenance **calendar** view | HomeZada | ⚠️ dates only | small gap |
| Household multi-user | HomeZada/Spullio | ❌ | deliberate not-now |
| Insurance RCV/ACV + carrier PDF | Encircle/Scanlily | ⚠️ basic PDF | deliberate skip |
| Wishlist / "things to sell" | Itemtopia | ⚠️ declutter+resale | partial |
| "Rediscover what you own" nudge | Spullio | ❌ | **gap (on-brand!)** |

**Takeaway:** My Stuff already covers **table-stakes + lending + privacy +
generous-free + unique cross-pillar links** — a stronger baseline than the raw
matrix suggests. The genuine gaps split cleanly into *on-brand wins* and
*off-brand traps*.

## Next-level plan (brand-filtered)

### A — Ship soon · on-brand · no paid infra
1. ✅ **Smart questions** — computed answers over *local* data (lent out /
   warranty ending / warranty ended / upkeep due / overdue returns / no location
   / not photographed / most valuable), zero AI/cost. Shipped folded into the
   renamed **Find & ask** modal: empty box → tappable question chips (with
   counts) → the matching items. `lib/smartQuestions.ts` (pure, unit-tested).
2. ✅ **"Rediscover what you own"** — a calm once-a-day dashboard card
   resurfacing a forgotten (least-recently-touched) item; open it or dismiss
   for the day. Deterministic per day (`lib/rediscover.ts`, unit-tested), tiny
   per-user localStorage dismiss — no cloud write.
3. ✅ **QR labels for locations/containers** — "Print QR labels" in the Locations
   manager renders a cut-out label sheet (QR + name + breadcrumb + count); the
   QR encodes `/inventory?location=<id>`, which a phone-camera scan opens
   filtered to that spot (deep link handled once). `lib/qr.ts` (lazy `qrcode`),
   `lib/locationLabels.ts` (pure HTML builder, tested), shared `printHtml`.
   *v1 = in-app deep link; v2 (no-app public page) still a future lift.*
4. ✅ **Wishlist** — a light "want to buy" list (its own `inventoryWishlist`
   subcollection, local-first + live sync) that ties into the duplicate guard
   ("you may already own this…" nudge as you type a name) and **links a
   bookmark** (the product page). "Got it" converts a wish into a real item in
   one tap. `lib/wishlist.ts` (pure, tested), `hooks/useWishlist.ts`,
   `WishlistModal`. Connection-over-breadth, not marketplace creep.
5. **Maintenance calendar view** — a calm timeline of upcoming warranty +
   maintenance dates (data already exists).
6. **Onboarding auto-rooms** — offer to seed common locations on first visit so
   the page is never blank (HomeZada's best onboarding idea, minus the overwhelm).

### B — Worth it · needs a decision / infra
- **AI photo→item (single item)** — suggest name/category from a photo. True
  multi-item/video capture needs **cloud vision + per-call cost + a privacy
  story**; ship only as an **opt-in, quota-gated** extra, never the default.
- **Push-when-closed reminders** (warranty/maintenance/return due) — needs a
  scheduled **Cloud Function** (Blaze); the in-app badge already covers the
  open-app case (roadmap §2.7).
- **App-lock (PIN / biometric via WebAuthn)** — on-brand privacy; the thing
  Sortly removed and users missed.
- **Photo-to-find** — visual similarity search; needs embeddings/cloud → gated.

### C — Skip · off-brand for this product
Household multi-user (single-`uid` fork — deliberate not-now) · insurance
RCV/ACV + carrier schedule-of-loss (the insurance-SaaS this app isn't) ·
home-finance / whole-home fixed-asset pillar / Plaid (HomeZada overwhelm) ·
public social shelves · full inbox receipt-email import (broad Gmail scopes vs
privacy) · AI-written resale listings + micro-sites (marketplace pivot) ·
public API/webhooks (pro audience, not the personal hub).

## Recommended sequence
**A1 (smart questions) → A2 (rediscover) → A3 (QR labels) → A4 (wishlist)** are
shipped — the highest value-per-effort and they reinforce the calm/connected
identity. A5 (maintenance calendar) → A6 (onboarding auto-rooms) follow.
Everything in B waits on an explicit go/no-go (cost, Blaze, or a privacy
decision); C stays out to protect the brand.
