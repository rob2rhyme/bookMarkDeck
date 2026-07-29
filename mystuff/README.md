# My Stuff — native app (Expo)

A private home inventory for iOS, Android and web. Spun out of the **My Stuff** pillar of
[Bookmark Deck](https://github.com/rob2rhyme/bookMarkDeck).

> **Status: scaffold.** The app skeleton, design system and the full business-logic layer are in
> place (28 test files / 210 tests green). Screens are being built against
> [`PARITY-CHECKLIST.md`](./PARITY-CHECKLIST.md), which is the contract — the port isn't done until
> every row is `done` or explicitly `deferred`.

## Why this exists

`MYSTUFF-NATIVE-PLAN.md` in the web repo: My Stuff outgrew Bookmark Deck. Native gets real push
reminders, offline storage, camera scanning, Face ID and store distribution — none of which a PWA
does well enough. Expo was chosen over Capacitor because a WebView wrapper risks App Store
Guideline 4.2 rejection, and over a Swift/Kotlin rewrite because the entire `src/lib` layer ports
unchanged.

## Stack

| | |
|---|---|
| Runtime | Expo SDK 57 · React Native 0.86 · React 19.2 |
| Routing | Expo Router (file-based; iOS + Android + web from one codebase) |
| Styling | NativeWind 4 + semantic tokens — **light and dark ship together** |
| Storage | Firestore (same project as the web app) → SQLite later, behind a repository interface |
| Tests | Vitest over the pure `src/lib` layer |

## Getting started

```bash
npm install
npm start          # then scan the QR with Expo Go
npm run ios        # or android / web
```

## Checks

```bash
npm run typecheck  # tsc --noEmit
npm test           # vitest — the ported logic suite
```

## Layout

```
app/            Expo Router routes
  (tabs)/       Items · Insights · Wishlist · More
  item/[id]/    item detail + edit
  add           add-item modal
  locations     nested locations manager
  guide, faq    in-app help
src/
  lib/          ported business logic — pure, framework-free, tested
  ui/           design system (tokens + primitives)
  components/   domain components built from the design system
  data/         repository interface + Firestore/SQLite adapters
  backup/       device / iCloud / Drive / Dropbox destinations
  server/       thin API helpers
```

## The reuse dividend

27 of 33 logic modules ported **verbatim**; only 6 needed platform swaps
(`crypto.randomUUID`, `Blob`, `canvas`, `navigator.share`, `crypto.subtle`, `localStorage`).
Their tests came across unchanged and stay green — that is the port's correctness proof.

## Monetization — decided

**One-time $14.99 lifetime unlock. No ads, ever.**

The free tier stays generous (unlimited items); the unlock gates only features
with a real per-use cost — AI capture, live price offers, photo storage at scale.
Implementation is RevenueCat IAP (15% Small Business tier) feeding the same
entitlement store the web app's Lemon Squeezy checkout writes to: one
entitlement, two payment rails.

**Why not ads.** The revenue math fails for a low-engagement app — roughly
**$0.20–0.35 per active user per year** at Tier-1 eCPMs, needing 3,000–5,000
monthly actives just to clear $1,000/year. Worse, AdMob forces an iOS App
Tracking Transparency prompt and a *"Data Used to Track You"* privacy label,
which flatly contradicts the on-device privacy promise — and a dozen competitors
already advertise "no ads" as a feature, so shipping them would rank this app
last on the axis the category competes on.

**Why one-time rather than subscription.** This audience demonstrably resists
subscriptions (Itemlist reports most buyers choose lifetime; StuffKeeper sells a
$14.99 one-time unlock). A subscription is the better business on paper; a
one-time unlock is the one people actually buy here.

## Naming

`mystuff` is a **placeholder slug**. "My Stuff" is too generic to own a store listing, and the
obvious alternatives are taken in-category (Cubby, Trove, kept, Stuffly, Quartermaster). Candidates
with no store conflicts found: **Ownly**, **Keepwise**, **Thingfolio** — pending App Store Connect
reservation and a USPTO check before the bundle id is fixed.
