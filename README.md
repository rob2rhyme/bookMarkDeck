# Everhold

**A calm, private home for everything you own.** Everhold is the standalone,
native successor to Bookmark Deck's "My Stuff" pillar — one app for iOS,
Android, and the web (Expo), where the barcode scanner knows a book from a
can, use-by dates and subscription renewals remind you quietly, and your
data stays yours (local-first, with backups to the destination you choose).

> Name note: screened 2026-07 against app stores and the home-inventory
> field ("My Stuff" variants, Holdall, Trove, Kept, Belongings, Shelf all
> conflicted or drowned in search). Run a final USPTO/App Store check before
> store submission.

## Status — Phase 0 ✅

The framework-free **logic core**, ported verbatim (tests included) from
[bookMarkDeck](https://github.com/rob2rhyme/bookMarkDeck)
`src/features/inventory/lib/`: value & tax math, item types, insights,
lending/borrowed/subscription ledgers, product-lookup parsers
(UPCitemdb · Open Facts · Open Library), price comparison, AI-capture
parsing, exports, search, and more. `npm test` runs the full ported suite.

Roadmap: `MYSTUFF-NATIVE-PLAN.md` in the bookMarkDeck repo (Phases 1–6:
Expo Router shell → scanner & photos → ledgers/insights → sync & backups →
notifications/widgets + new kinds → stores).

## Commands

- `npm run typecheck` — strict TS, no emit
- `npm test` — vitest (node environment; the core has no DOM/React)
