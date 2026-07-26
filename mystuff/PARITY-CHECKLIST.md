# Parity checklist — My Stuff (web) → native

**This file is the contract.** The port is not done until every row is `✅ done` or
`⏭ deferred` **with a stated reason**. "Not a single feature missing" is only meaningful if
it is auditable, so nothing may be dropped silently.

Source of truth for the web original: `src/features/inventory/**` in `rob2rhyme/bookMarkDeck`
(25 components · 12 hooks · 33 lib modules · 1 data module · 6 API routes).

Legend: `✅ done` · `🚧 in progress` · `⬜ not started` · `⏭ deferred (reason)`

---

## 0. Foundation

| # | Item | Status |
|---|---|---|
| 0.1 | Expo Router app skeleton (tabs: Items · Insights · Wishlist · More) | ✅ done |
| 0.2 | NativeWind 4 + semantic theme tokens, **light + dark from day one** | ✅ done |
| 0.3 | UI primitives (Button, Card, Field, Chip, Badge, EmptyState, Skeleton, ListRow) | ✅ done |
| 0.4 | Pure `lib/*` ported with tests green (28 files / 210 tests) | ✅ done |
| 0.5 | Data layer behind a repository interface (`src/data/repo.ts`) | ⬜ not started |
| 0.6 | Firestore sync — **same Firebase project**, same `users/{uid}` schema | ⬜ not started |
| 0.7 | SQLite local store (swap behind the repo interface once parity proven) | ⏭ deferred — after parity, per plan N.5 |

## 1. Items — the core

| # | Feature | Web source | Status |
|---|---|---|---|
| 1.1 | Item CRUD (add / edit / archive / delete) | `useInventory`, `ItemFormModal` | 🚧 add form scaffolded |
| 1.2 | Type-aware forms — 7 kinds (General/Book/Food/Self-care/Clothing/Tool/Digital) | `ItemFormModal`, `types.ts` | 🚧 kind chips scaffolded |
| 1.3 | Item detail + life history | `ItemDetailModal`, `activity.ts` | ⬜ |
| 1.4 | Views: grid / list / shelf | `ItemCard`, `ItemListCard` | ⬜ |
| 1.5 | Search + location filter | `inventorySearch.ts` | ⬜ (lib ported) |
| 1.6 | Undo on destructive actions | `InventoryDashboard` | ⬜ |
| 1.7 | Quantity + **restock / low-stock loop** ("−1 used") | `value.ts` `lowStock` | ⬜ (lib ported) |

## 2. Capture

| # | Feature | Web source | Status |
|---|---|---|---|
| 2.1 | Barcode / UPC / ISBN scan | `barcodeEngine.ts` + `BarcodeScanner` | ⬜ — swap ZXing-WASM → `expo-camera` |
| 2.2 | Product lookup chain (Open Library → UPCitemdb → Open Food/Beauty) | `productLookup.ts` | ⬜ (lib ported) |
| 2.3 | Receipt OCR | `receiptOcr.ts`, `ocrEngine.ts` | ⬜ — Tesseract or native OCR |
| 2.4 | Label scan | `labelScan.ts` | ⬜ (lib ported) |
| 2.5 | AI photo capture | `aiCapture.ts` + `/api/inventory/ai-capture` | ⬜ — **gated on `ANTHROPIC_API_KEY`; hidden in web today. Must not be lost.** |
| 2.6 | Item photos (R2 + data URL) | `uploadPhoto.ts`, `image.ts`, `r2.ts` | ⬜ — needs RN image pipeline |

## 3. Organise

| # | Feature | Web source | Status |
|---|---|---|---|
| 3.1 | Nested locations | `useInventoryLocations`, `LocationManager` | ⬜ |
| 3.2 | QR location labels + print | `qr.ts`, `locationLabels.ts` | ⬜ — print → `expo-print` |
| 3.3 | Collections / kits | `collections.ts`, `CollectionsModal` | ⬜ (lib ported) |
| 3.4 | Starter rooms onboarding | `starterRooms.ts`, `StarterRoomsCard` | ⬜ (lib ported) |
| 3.5 | Where is…? + smart questions | `WhereIsModal`, `smartQuestions.ts` | ⬜ (lib ported) |

## 4. Money & value

| # | Feature | Web source | Status |
|---|---|---|---|
| 4.1 | Value + resale/depreciation panel | `value.ts`, `ValuePanel` | ⬜ (lib ported) |
| 4.2 | Price comparison (items + wishlist) | `priceCompare.ts`, `PriceComparisonPanel` | ⬜ (lib ported) |
| 4.3 | Wishlist + "got it" → item | `wishlist.ts`, `WishlistModal` | ⬜ |
| 4.4 | Warranty + tax-true totals | `value.ts` | ⬜ (lib ported) |
| 4.5 | Subscriptions / digital ledger | `digital.ts`, `SubscriptionsModal` | ⬜ (lib ported) |
| 4.6 | Insurance report (PDF) | `insuranceReport.ts` | ⬜ — `window.print` → `expo-print` |

## 5. Ledgers & attention

| # | Feature | Web source | Status |
|---|---|---|---|
| 5.1 | Lending ledger | `lending.ts`, `LendingLedgerModal` | ⬜ (lib ported) |
| 5.2 | Borrowed ledger | `borrowed.ts`, `BorrowedLedgerModal` | ⬜ (lib ported) |
| 5.3 | Attention panel (all buckets incl. low stock) | `value.ts` `attention()` | ⬜ (lib ported) |
| 5.4 | Maintenance / upkeep calendar | `maintenanceCalendar.ts` | ⬜ (lib ported) |
| 5.5 | Documents (receipts, manuals) | `documents.ts` | ⬜ (lib ported) |

## 6. Discover & reflect

| # | Feature | Web source | Status |
|---|---|---|---|
| 6.1 | Insights + charts + local facts | `insights.ts`, `InsightsModal` | ⬜ (lib ported) |
| 6.2 | AI insights | `/api/inventory/insights` | ⬜ — gated on `ANTHROPIC_API_KEY` |
| 6.3 | Trending | `activity.ts` `trending()` | ⬜ (lib ported) |
| 6.4 | Rediscover (daily pick) | `rediscover.ts`, `RediscoverCard` | ⬜ (lib ported) |
| 6.5 | Declutter | `declutter.ts`, `DeclutterModal` | ⬜ (lib ported) |
| 6.6 | Milestone badges | web `MilestoneRow` | ⬜ |

## 7. Data & privacy

| # | Feature | Web source | Status |
|---|---|---|---|
| 7.1 | CSV export | `exportInventory.ts` + `csv.ts` | ⬜ (lib ported) |
| 7.2 | JSON export / import (**merge-by-id, never overwrite**) | `exportInventory.ts` | ⬜ (lib ported; `mergeById` must move to lib + be tested) |
| 7.3 | Backup destinations (device / iCloud / Drive / Dropbox) + auto cadence | plan step 3 | ⬜ |
| 7.4 | App lock — **upgrade PIN → Face ID / Touch ID** | `appLock.ts` | ⬜ — `expo-local-authentication` |
| 7.5 | Item sharing | `share.ts` | ⬜ — `navigator.share` → native share sheet |

## 8. Cross-pillar links (decide: keep or drop when standalone)

| # | Feature | Status |
|---|---|---|
| 8.1 | Item ↔ bookmark links (`useBookmarkLibrary`) | ⏭ **decision needed** — standalone app has no Bookmarks pillar |
| 8.2 | Item ↔ Focus project (`focusProjects.ts`) | ⏭ **decision needed** — same |
| 8.3 | Activity → shared timeline | ⏭ becomes app-local activity |

## 9. Native-only upgrades (beyond parity — the "100%+")

| # | Feature | Status |
|---|---|---|
| 9.1 | On-device push reminders (warranty/use-by/renewal/restock) | ⬜ |
| 9.2 | Native camera barcode | ⬜ |
| 9.3 | Face ID app lock | ⬜ (see 7.4) |
| 9.4 | Share-target ("share a product page into My Stuff") | ⬜ |
| 9.5 | Home-screen widgets | ⬜ |
| 9.6 | Quick actions (Add item / Where is…) | ⬜ |
| 9.7 | Spotlight / App Intents indexing | ⬜ |
| 9.8 | FlashList + `expo-image` at scale | ⬜ |

## 10. Beginner experience

| # | Feature | Status |
|---|---|---|
| 10.1 | In-app **Guide** (task-oriented, plain language) | ✅ done |
| 10.2 | In-app **FAQ** (privacy/data-ownership first) | ✅ done |
| 10.3 | First-run onboarding (3 cards + starter rooms) | ⬜ |
| 10.4 | Progressive-disclosure add flow | ✅ done (scaffold) |
| 10.5 | Teaching empty states everywhere | 🚧 4 screens done |

---

### Known web defects deliberately NOT ported
Tracked so they are fixed by construction rather than inherited (see plan N.7):
- `ItemFormModal` placeholder-only fields (~44 controls / ~6 labels) → the `Field` primitive makes a
  visible label structural.
- `mergeById` untested inside a 1,200-line component → must live in `lib/` with tests.
- Backup config riding inside the backup payload → must be local-only device state.
- `restoreInventoryBackup` swallowing per-record failures → surface a failed count.
