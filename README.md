# Everhold

**Hold everything.** A calm, private home inventory for all of it — tools,
books, pantry, self-care, clothing, digital subscriptions — with warranties,
tax-true totals, lending, and insights. Native on iOS + Android + web from one
Expo codebase.

Everhold is the standalone spin-out of Bookmark Deck's *My Stuff* pillar. The
roadmap and platform decisions live in that repo's `MYSTUFF-NATIVE-PLAN.md`.

> **Name screening (2026-07):** "Everhold" surfaced zero app-store, company,
> or brand conflicts at research time. Run a final USPTO / App Store / Play
> Store availability check right before store submission.

## Status

- ✅ **Phase 0 — logic core.** All 58 pure library modules ported verbatim
  from Bookmark Deck (`src/lib/`): value & tax math, insights, borrowed +
  subscription ledgers, product lookup parsers, AI-capture parsing,
  CSV/JSON export, barcode/OCR/QR engines. 200+ unit tests, green.
- ✅ **Phase 1 — Expo shell.** Expo Router tabs (Items · Insights · Wishlist
  · More), local-first storage (SQLite on device, localStorage on web),
  items list/add/detail with **type-aware forms** (📚 book · 🥫 food ·
  🧴 self-care · 👕 clothing · 🛠 tool · 💾 digital), tax-true costs,
  warranty plans, borrowed/rented origin, delete-with-undo, starter rooms,
  and a **dark + light theme** (system default, manual override persisted).
- ⏭ Phase 2 — native barcode scanning, photos, locations + QR labels.
- ⏭ Phase 3 — price comparison, ledgers, full insights charts, EAS Update.
- ⏭ Phase 4 — Google sign-in + Firestore sync (same project as Bookmark
  Deck, so existing users keep their data), backup destinations
  (device / iCloud / Drive / Dropbox), app lock.
- ⏭ Phase 5 — push reminders, widgets, share-target; Vehicle/Medicine/Media.
- ⏭ Phase 6 — store assets, Play → App Store, web target → Vercel.

## Try it on your phone (no build needed)

```bash
npm install
npx expo start
```

Scan the QR with **Expo Go** (App Store / Play Store) — the app runs
immediately. `w` opens the web version in a browser.

## Scripts

- `npm run typecheck` — TypeScript, strict
- `npm run test` — Vitest unit suite (the ported logic core + store helpers)
- `npx expo export --platform web` — static web build (CI runs this as a
  bundling smoke test)

## Layout

```
src/app/        Expo Router routes: (tabs)/ · item/[id] · item/form
src/lib/        ported logic core (React-free, unit-tested)
src/data/       storage adapters (SQLite / localStorage) + inventory store
src/ui/         theme tokens (slate/blue, dark+light) + themed primitives
```

Local-first, private by default: everything stays on the device until sync
ships (and stays opt-in after).
