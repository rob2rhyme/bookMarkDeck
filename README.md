# Bookmark Deck

A calm, private home for your online life — and the life around it. Four pillars share one roof:

| Pillar | What it holds |
|---|---|
| **Bookmarks** (home) | The sites and apps you use — nestable folders, app shortcuts, search, import/export |
| **Focus** (`/focus`) | The work you do — Pomodoro timer, tasks & to-dos, journal, analysis, wellbeing extras |
| **Habits** (`/habits`) | The consistency you build — forgiving streaks, insights, gentle reminders |
| **My Stuff** (`/inventory`) | The things you own — home inventory with photos, values, warranties, lending & more |

Everything is **local-first** (saves to your device instantly, works offline, installable as a PWA) and syncs to your own Google account when you're signed in. **One sign-in connects sync for every pillar** — no per-app prompts. No analytics, no ads.

## What's inside

### Bookmarks — the home page
- Bookmark cards with title, URL, icon, folder, tags, and a private (hidden-by-default) note; pin favorites; usage-based **Trending**.
- **App shortcuts**: a separate launcher row for the handful of apps you open constantly.
- **Nestable folders** with dedicated pages, breadcrumbs, subtree search, bulk select/move/delete (with Undo), a full **Manage** tree, and **✨ Auto-organize** that proposes a categorization plan before you apply it.
- Import browser bookmarks (Netscape HTML) or a JSON backup with a merge preview; export standard HTML; cloud sync keeps your **last 7 snapshots** restorable.
- **⌘K command palette**: jump anywhere, add a bookmark, search everything.

### Focus — the work hub
- Settings-driven **Pomodoro** + stopwatch, timestamp-accurate in background tabs, with chimes and system notifications (even when the tab is closed).
- **Tasks** (what the timer works on) vs **to-dos** (your checklist — personal ones can mirror to Google Tasks/Calendar); intentions, reflections, and a "work on this in Focus" hand-off from any bookmark.
- **Journal**: daily mood, timestamped notes, and a dream log with streaks and a heatmap.
- **Analysis**: daily-goal pace, streaks, 7-day chart, mood trend, focus rhythm by hour, weekly top tasks, top resources.
- Optional wellbeing extras: hydration tracking, guided **meditation** & breathing, "Let them" 60-second resets, interest-tuned quotes and a points-earning quiz.

### Habits — the record of consistency
- Yes/no or measurable habits, scheduled daily / specific days / times-a-week, for building or quitting.
- **Forgiving streaks** (today-not-yet doesn't break one; planned skips are neutral), weekly bars, best weekdays, 30-day rates, a tappable year heatmap, and habit→focus hand-offs.

### My Stuff — home inventory
- Add items fast: **barcode scan** (phone camera, webcam, or USB scanner) with free product-database lookup, **on-device label OCR**, receipt scan — nothing camera-touched ever leaves the device.
- Full records: photos (compressed locally), price **plus tax rate** (cards and totals always show the tax-included cost), a **warranty plan** (cost + length in years — the expiry date fills in automatically and the plan joins the total), condition (incl. *Open box*), **in-original-box?**, serial, warranty & maintenance dates, store URL, tags, nestable **locations** (rooms → shelves → boxes) with printable **QR labels**.
- Three views: grid, **detail-rich list** (ledger-style wide cards), and shelf (grouped by location).
- **Price comparison**: save competitor store links per item; live barcode-matched offers take over automatically when available.
- **Lending & item history**: who has what and when it's due, condition out vs. back, one-tap status (*Have / Misplaced / Lost / Returned* — a faulty item **returned under warranty** keeps its record but drops out of every total), "Used today", and an automatic per-item activity timeline.
- **📈 Insights**: a category pie, bars for locations/tags/status/warranty outlook, an **interest-over-time** chart (additions per quarter by category), on-device facts, and an optional **AI read** of your patterns (aggregates only — no item names leave the device).
- **🔥 Trending** (most used / lent / moved, 90 days), value panel with a category-aware **resale estimate** and depreciation curve, attention panel + nav badge for warranties/upkeep, wishlist with already-own detection and scan-filled product thumbnails, kits/collections, declutter pile, daily **Rediscover** nudge, "where's my…" quick-find, insurance report (PDF), CSV/JSON export & merge-safe import, and an optional PIN/biometric **app lock**.
- Deletes offer **Undo** — items come back whole, photos and receipts included.

### Personalization
- Appearance settings (fonts — including your own font file, kept on-device — and size tuning), decorative cursor companions, and a mobile bottom nav.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Required environment (see `.env.example` for the full annotated list):

- **next-auth**: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Firebase (client)**: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- Optional: web-push keys (timer alerts), QStash (scheduled push), `UPC_LOOKUP_*` (paid barcode/price tier), R2 (photo storage)

> For fully zero-click sync, whitelist your Google OAuth client ID on the Firebase project's Google provider — otherwise sync still works via a single tap.

### Scripts

- `npm run dev` — dev server
- `npm run build` / `npm run start` — production build & serve
- `npm run typecheck` / `npm run lint` — TypeScript validation
- `npm run test` — Vitest unit suite (`npm run test:watch` for watch mode)

CI (`.github/workflows/ci.yml`) runs typecheck + tests + build on every PR.

## Tech overview

- **Next.js 16** (App Router) · React 19 · TypeScript · Tailwind CSS v4 · deployed on Vercel.
- **Dual-layer auth**: next-auth (Google) owns the session; Firebase Auth owns Firestore access. A silent id_token bridge connects the two, so one Google sign-in covers every pillar's sync (see `CLAUDE.md` → *Auth*).
- **Data**: one Firestore document per user (`users/{uid}`) plus per-feature subcollections; `localStorage` is a per-user local cache. Cloud writes are optimistic and fail-safe.
- **PWA**: manifest + conservative service worker (network-first navigations, cache-first hashed assets, `/api/*` untouched) + offline fallback.
- Feature pillars live under `src/features/{focus,habits,inventory}` and are removable; shared UI in `src/components`.

### More documentation

- **In-app**: `/guide` (the full user guide), `/faq`, `/habits/guide`, `/privacy`, `/terms`
- **Repo**: `CLAUDE.md` (architecture source of truth), `FOCUS-INTEGRATION.md`, `INVENTORY-ROADMAP.md`, `SECURITY.md`, `CAPACITOR_IOS.md`, `TROUBLESHOOTING.md`

## Privacy summary

- Local data lives in your browser; cloud data lives in Firebase Firestore scoped to your Google account alone.
- Camera features (barcode, label OCR, receipt scan) run entirely on-device.
- No analytics, tracking, or ad SDKs.
- Leaving: export your data, delete locally, sync the empty state, and revoke access at myaccount.google.com/permissions.

## License

MIT
