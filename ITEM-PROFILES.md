# ITEM-PROFILES — one model, forms that fit the thing

Owner question (2026-07-17): *pantry food, self-care with expiry, clothing,
books (read/not-read, want-to-read) — forms differ per thing; a can has no
warranty. What's missing? Make it a standout.*

## The design (shipped as Phase 1)

**One `InventoryItem`, many faces.** A `kind` field (General · 📚 Book ·
🥫 Food & pantry · 🧴 Self-care · 👕 Clothing · 🛠 Tool) reshapes the *form
and reminders* — never the storage. Every kind keeps every item power (scan,
photos, locations, price + tax, editable cards, delete-undo, sync, CSV/JSON,
Insights) because they all *are* items.

| Kind | Gets | Loses (form only) |
|---|---|---|
| General / Tool | everything (unchanged) | — |
| 📚 Book | author, read status (📕 not read · 📖 reading · ✅ read) | warranty, maker/model/serial, in-box |
| 🥫 Food | **use-by date** → Attention panel | warranty, maker row, serial, condition, in-box, lending, est. value |
| 🧴 Self-care | use-by + **opened-on + PAO months** (expiry = earlier of the two) | same as food |
| 👕 Clothing | size | warranty, in-box (keeps maker/brand, condition, lending) |

**The smart part — scans route themselves.** The lookup pipeline already
queries Open **Food** Facts and Open **Beauty** Facts; Phase 1 adds **Open
Library** (free, keyless) for bookland EANs (978/979). The *source that
matched* now returns a `kindHint`, so scanning a cereal box opens the pantry
form, a moisturizer the self-care form, and a paperback fills title, author,
cover, and flips to the Book form — zero taps. This is the entry-speed rule:
pantry logging dies if a can takes more than scan → qty → use-by.

**Want-to-read = the wishlist.** No parallel list: scan a book into the
Wishlist and it's your want-to-read shelf (with price comparison, because a
wish is a wish). *Got it* moves it into My Stuff as a Book.

**Use-by ≠ warranty.** Consumables feed two new Attention buckets — *Past
use-by* (red) and *Use by soon* (amber, 14-day horizon — food moves faster
than warranties) — and count toward the nav reminder badge.

## Category audit — what else, and what deliberately not

| Candidate | Verdict | Why |
|---|---|---|
| Electronics / appliances | **Covered** — that's General/Tool | warranty+serial+resale was built for them |
| Medications / supplements | **Covered by Food mechanics** (use-by, qty) — no dedicated kind | dosing/schedules is a health app; privacy-sensitive; out of brand |
| Plants | **Mostly covered** — `Maintenance due` = watering/repotting | a "plant" kind adds nothing but an icon; revisit on demand |
| Media (games, vinyl, DVDs) | **Book-adjacent** — General + category works; a "played/watched" status is Phase 3 if asked | same shape as books, smaller audience |
| Collectibles / art | **Covered** — General + manual value + photos + insurance PDF | value-first, already strong |
| Seasonal décor, sports gear | **Covered** — locations, kits/collections, in-box | storage problem, already solved |
| Documents / warranties papers | **Covered** — per-item attachments (receipts/manuals) | |
| Pets | **No** — living things aren't inventory | brand line |
| Kids' sizes rotation | Clothing kind + tags; a size-timeline is a niche Phase 3+ | |

Rule going forward: **a new kind must earn its form** — it needs at least one
field or reminder that no existing kind provides. Otherwise it's a category
label, and categories are free-text already.

## Why this is the standout shape

Competitors pick a lane: Sortly (durables), Pantry Check (food), StyleBook
(clothes), Goodreads (books). Each is another app, another account, another
subscription. My Stuff's wedge is **one calm, private home for all of it** —
where the barcode scanner knows a book from a can, the pantry can re-buy via
price comparison, the bookshelf lends via the lending ledger, and one
Insights panel sees your whole material life. Nobody in the research set has
cross-domain items with domain-smart forms.

## Phasing

- **Phase 1 (this PR)**: `kind` + per-kind forms · books (author, read
  status, ISBN → Open Library autofill, one-tap read toggle in detail) ·
  use-by / opened+PAO → Attention · size · scan `kindHint` routing ·
  Firestore/CSV/JSON round-trip · docs.
- **Phase 2**: consumable depletion — "− used one" on cards, `restockAt`
  threshold, *running low* → one-tap ♡ wishlist re-buy. Kind filter pill on
  the grid; Insights: expiring-outlook bar + kind split.
- **Phase 3**: clothing cost-per-wear (paid ÷ "wore it" events — data already
  logged); reading stats (books finished per quarter, by author); optional
  "watched/played" status generalization for media.

*Related: `ANALYSIS-MYSTUFF-NEXTLEVEL.md` (benchmark), `INVENTORY-ROADMAP.md`
(monetization), `ANALYSIS-MOBILE-APP-STRATEGY.md` (store path).*
