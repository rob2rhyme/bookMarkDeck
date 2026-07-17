# MYSTUFF-NATIVE-PLAN — spinning My Stuff out as a native app (mobile + web)

Owner brief (2026-07-17): *My Stuff has outgrown Bookmark Deck. Spin it out;
go native on all platforms; add user-chosen backup destinations (device /
iCloud / Drive / Dropbox); find a platform with a Vercel-like "push to
GitHub → test instantly" loop (no local builds); set a generous free tier
vs competitors; close remaining category gaps; scaffold a beginner-friendly
yet premium UI with 100%+ feature parity, responsive, theme toggle.*

Verified 2026-07. Companion docs: `ITEM-PROFILES.md` (item types),
`ANALYSIS-MOBILE-APP-STRATEGY.md` (store path — superseded where this
conflicts), `INVENTORY-ROADMAP.md` (monetization).

---

## 1. Platform decision: **Expo (React Native) + EAS**

The deciding constraint is the owner's workflow: *test a deployed result
instantly, driven from GitHub, no local Xcode/Android Studio.* Expo is the
only stack that reproduces the Vercel loop for native apps:

| Vercel habit today | Expo equivalent |
|---|---|
| `git push` → preview URL | **EAS Build via the Expo GitHub app** — cloud builds on push, no local toolchain (free tier: **15 iOS + 15 Android builds/month**, 45-min timeout) |
| Open the preview link on the phone | **Expo Go** — scan a QR, the app runs on the phone immediately (day-1, zero builds); later, a **development build** installed once behaves the same |
| Redeploy = instant | **EAS Update (OTA)** — every JS/style change ships over-the-air to the installed build on next launch (or immediately via `reloadAsync`); native binaries are only rebuilt when a native dependency changes |
| CI on push | **EAS Workflows** / `expo-github-action` — build, update, and store-submit from GitHub events |
| One codebase, web too | **Expo Router targets iOS + Android + web from the same code** — the web output still deploys to Vercel, so the web app keeps the exact workflow you have now |

Why not the alternatives:

- **Capacitor (current shell)** — it's a website in a box; you asked for
  native. Keep `capacitor.config.ts` as a fallback, but it stops being the
  plan of record.
- **Flutter + Codemagic** — new language (Dart), zero reuse of the
  TypeScript brain and code you've built, and its fast loop (hot reload) is
  a *local* loop — the opposite of your constraint.
- **PWA only** — already shipped; doesn't get store distribution or the
  native capabilities users expect.

**The reuse dividend is decisive**: every `src/features/inventory/lib/*.ts`
module (value math, insights, borrowed/digital ledgers, product lookup
parsers, price compare, export/import — all React-free and unit-tested by
design) ports to Expo **unchanged, tests included**. The React mental model,
hooks patterns, and even Tailwind classes (via **NativeWind**) carry over.

**Cost of entry**: Apple $99/yr, Google Play $25 once, EAS free tier to
start ($19/mo Starter only if build volume demands it). Expo Go and EAS
Update cover day-to-day testing without consuming build quota.

## 2. Backup options (the screenshot pattern)

A Settings → **Backup** sheet exactly like the reference: *"Your data will
be backed up and saved to the location of your choice."*

| Destination | How | Platforms |
|---|---|---|
| **On this device** | JSON/CSV snapshot via the share sheet / file save (the exporter already exists) | all |
| **iCloud Drive** | `react-native-cloud-storage` (kuatsu) — unified fs-style API, **Expo config plugin**, iCloud on iOS | iOS |
| **Google Drive** | same library (Drive on iOS/Android/web) — and the repo already has a working Drive sync pattern (`googleDriveSync.ts`) | all |
| **Dropbox** | Dropbox HTTP API (free app key, `/backups/mystuff.json`) | all |

Design rules: **local-first stays the default** (no account required —
"On this device" always works). Auto-backup = daily/weekly/off, last-backup
timestamp shown, restore = the existing merge-by-id import (nothing
overwritten). Firestore live sync remains a *separate, optional* "Sync"
concept — backup is a file you own; sync is convenience.

## 3. Free tier — the generosity table

Competitor free caps (verified 2026-07):

| App | Free cap |
|---|---|
| Sortly | **100 items**, 1 user ($4.99/mo for unlimited) |
| Itemtopia | **20 items** |
| Nest Egg Lite | **25 items** |
| HomeProof | 100 items |
| Encircle | 2 properties (insurance-flow limited) |

**Recommendation — keep what we already promised: unlimited items, free,
forever.** The welcome feeling *is* the acquisition wedge; a cap converts
the first joyful hour into a sales pitch. Meter only what costs real money
per use, exactly as `INVENTORY-ROADMAP.md` §4 concluded:

- Free: unlimited items/locations/kinds, scan & lookups (shared trial),
  manual price links, lending/borrowed/digital ledgers, insights, exports,
  local + own-cloud backups. Everything that exists today.
- Premium (~$19.99/yr): AI capture & AI insights quotas, real-time price
  offers, push-when-closed reminders, photo storage at scale.

If a number is ever forced (store-listing psychology), the floor is
**1,000 items** — 10× the most generous competitor — but default to
unlimited.

## 4. Category gaps — what to add so nobody feels a hole

Current kinds: General · 📚 Book · 🥫 Food · 🧴 Self-care · 👕 Clothing ·
🛠 Tool · 💾 Digital. Research (competitor feature sets + store listings)
says the remaining wants cluster into:

| Candidate | Verdict | What it earns |
|---|---|---|
| 🚗 **Vehicle** | **Add (next)** | VIN/plate, mileage log, service intervals (reuse maintenance), **registration + insurance renewal dates** (reuse the rolling-renewal mechanic from Digital) |
| 💊 **Medicine cabinet** | **Add (next)** | expiry (reuse use-by), refill threshold (Phase-2 restock mechanic), strictly local-first + app-lock nudge for privacy; *no dosing schedules* (health-app line) |
| 🎮 **Media** (games/vinyl/DVDs) | Add cheaply | generalize `readStatus` → experienced status ("played/watched"); Open Library-style lookup already covers books; UPC covers discs |
| 🪴 Plants | Preset, not a kind | watering = existing maintenance date; species in notes |
| 🐾 Pet supplies | Preset under Food/General | food expiry + restock already fit; pets themselves stay out (living things aren't inventory) |
| 🛂 Documents/IDs (passport, licenses) | Preset under Digital/General | expiry = renewal mechanic; attachments already exist; app-lock emphasized |
| 🏺 Collectibles | Covered | value + condition + photos + insurance PDF already strong |
| 👶 Kids' sizes | Covered by Clothing + tags | size-timeline only if users ask |

Rule (from `ITEM-PROFILES.md`): **a kind must earn its form.** Vehicle and
Medicine clearly do; Media rides an existing mechanic; the rest are presets.
With those three added, the category story has no obvious hole left —
every "can I track X?" from competitor reviews lands on a yes.

## 5. Scaffolding plan — `mystuff` (new repo)

### 5.1 Shape

```
mystuff/
├─ app/                      # Expo Router routes (iOS + Android + web)
│  ├─ (tabs)/                #   Items · Insights · Wishlist · More
│  │   ├─ index.tsx          #   Items grid/list (+ scan FAB)
│  │   ├─ insights.tsx
│  │   ├─ wishlist.tsx
│  │   └─ more.tsx           #   ledgers, locations, backup, settings, guide
│  ├─ item/[id].tsx          #   detail
│  └─ add.tsx                #   type-aware add form (modal route)
├─ src/
│  ├─ lib/                   # ⬅ ported UNCHANGED from bookMarkDeck
│  │   (value, insights, borrowed, digital, wishlist, priceCompare,
│  │    productLookup, aiCapture, exportInventory, activity, image…)
│  ├─ data/                  # SQLite (expo-sqlite) local-first store
│  │   + optional Firestore sync (SAME schema/project as today)
│  ├─ backup/                # destinations: device / iCloud / Drive / Dropbox
│  ├─ ui/                    # NativeWind components, theme tokens
│  └─ server/                # tiny API (Vercel functions, reused routes:
│      product-lookup, price-compare, ai-capture, insights)
├─ eas.json                  # dev / preview / production profiles
└─ .github/workflows/        # EAS Workflows: build on native change,
                             # EAS Update on JS change, web → Vercel
```

- **Stack**: Expo SDK (current), TypeScript, Expo Router, **NativeWind**
  (the slate/blue token system transfers), `expo-sqlite` (thousands of
  items, real queries, offline-first), `expo-camera` (native barcode —
  faster than ZXing-WASM), `expo-notifications` (use-by/renewal/warranty
  alerts — finally push-when-closed), `expo-local-authentication` (app
  lock upgrades to Face ID), `react-native-cloud-storage` (backups).
- **The migration superpower**: keep the **same Firebase project**. The new
  app syncs the same `users/{uid}` documents, so during the whole
  transition the old web app and the new native app see the same data —
  users lose nothing on day one, and the web pillar keeps running until
  parity is proven. Bookmark Deck then slims back to bookmarks/focus/habits
  (`src/features/inventory` is removable by design).

### 5.2 UI: beginner-friendly, premium, responsive, themed

- **Progressive disclosure** (the house pattern already): Add = name + type
  chips + scan; everything else behind "Add details." First-run onboarding
  = three cards (Scan anything · It reminds you · Yours forever/private) +
  starter rooms seeding.
- **Scan-first**: a large center FAB (📷) — scan routes to the right form
  by source (ISBN → Book etc.), AI capture behind it.
- **Premium feel**: the existing dark slate/blue token set, spring
  micro-interactions (Reanimated), haptics on save/undo, skeleton loaders,
  generous empty states that teach.
- **Responsive**: phone-first; tablet/desktop/web get 2–3-column grids and
  side-panel detail (Expo Router layout breakpoints) — same code.
- **Theme toggle**: light theme joins dark — NativeWind `vars()` token
  pairs (slate-950/50 inversions, same accent blues), `useColorScheme()`
  system default + manual override persisted in settings. Ship both from
  day one so light never becomes a retrofit.
- **Every feature ports** (the 100%+ checklist): items CRUD + undo · 7→10
  kinds & type-aware forms · barcode/ISBN/UPC lookup chain · AI capture ·
  price comparison (items + wishlist) · wishlist scan-to-prefill + ♡
  wish-again · lending & borrowed ledgers · returned/refund status ·
  warranty plans + tax-true totals · subscriptions ledger · locations + QR
  labels · kits · declutter · rediscover · where-is · value/resale panel ·
  insights charts + AI read · attention + upkeep calendar · insurance PDF ·
  CSV/JSON export/import · app lock · share · guide. **Plus native-only
  upgrades**: offline SQLite, real push reminders, home-screen widgets
  (renewals/use-by), share-target ("share a product page into My Stuff"),
  Face ID lock, haptics.

### 5.3 Phases (each ends testable-on-phone from GitHub)

| Phase | Scope | Test loop |
|---|---|---|
| 0 (~2 days) | New repo; port `lib/` + tests verbatim; CI green | vitest in Actions |
| 1 (~1 wk) | Expo Router shell, tabs, SQLite store, items list/add/detail with type-aware forms, dark+light | **Expo Go QR** — instant, no builds |
| 2 (~1 wk) | Native scanner + lookup chain, photos, locations+QR, undo/toasts | Expo Go → first **dev build** via EAS (GitHub app) |
| 3 (~1 wk) | Wishlist, price compare, ledgers (lending/borrowed/subs), attention, insights | **EAS Update on push** — the Vercel feeling |
| 4 (~1 wk) | Firestore sync (same project), Google auth, backup destinations sheet, app lock/Face ID | dev build + EAS Update |
| 5 (~3–4 days) | Push notifications, widgets, share-target; Vehicle/Medicine/Media kinds | preview builds → internal distribution QR / TestFlight |
| 6 | Polish, store assets, Play first → App Store; web target → Vercel | EAS Submit from GitHub |

Realistic solo+Claude calendar: **5–7 weeks to store submission**, web
parity included, with the old app untouched until you flip DNS/marketing.

### 5.4 Risks & mitigations

- **iOS on-device testing needs one Apple step** — Expo Go needs nothing;
  ad-hoc dev builds need the $99 account (get it in Phase 2, not later).
- **EAS free tier (15+15 builds/mo)** — plenty, because EAS Update makes
  binary rebuilds rare; only native-dependency changes rebuild.
- **Firestore offline vs SQLite** — SQLite is the source of truth locally;
  Firestore mirrors it (same optimistic, fail-safe pattern as today).
- **Scope creep during port** — parity first, new kinds only in Phase 5;
  the checklist in §5.2 is the contract.

---

*Sources: Expo GitHub builds & pricing (docs.expo.dev/build/building-from-github,
docs.expo.dev/billing/plans, viprasol.com), EAS Update mechanics
(docs.expo.dev/eas-update, expo.dev/solutions/eas-ota-updates), backup lib
(react-native-cloud-storage.oss.kuatsu.de — Expo plugin, iCloud + Drive),
free-cap research (clubofthings.app Sortly/alternatives roundups,
homeproofvault.com, saveor.com), category/feature scans (Itemtopia listings,
sagesure.com, hippo.com, InvenDo/Home Inventory Play Store listings).*
