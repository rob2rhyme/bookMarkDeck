# My Stuff — Decoupling & Mobile-App Readiness

_Answers the "disintegration mystuff + make standalone mobile app" ask: how
cleanly the inventory ("My Stuff") pillar can be extracted, the concrete work to
fully decouple it, and how that feeds the existing mobile plans
(`MYSTUFF-NATIVE-PLAN.md` = Expo rewrite, `ANALYSIS-MOBILE-APP-STRATEGY.md` +
`CAPACITOR_IOS.md` = Capacitor shell)._

## 1. Decoupling status — how removable is My Stuff today?

**Removability has two directions, and this document used to conflate them.**
*Inbound* — does anything else import this feature? *Outbound* — does this feature
reach into another? A pillar can be perfectly removable itself while making a
different pillar unremovable.

Measured across `src/features` (imports of `@/features/<other>`, tests excluded):

| Feature | Imported by others? | Reaches into others? |
|---|---|---|
| **Inventory** | yes — `AppShell` (C1) | **no** |
| **Focus** | no | **no** — but see below, habits reaches *in* |
| **Filing** | no | no |
| **Habits** | no — only its route | **yes: 7 edges** (5 → focus, 2 → inventory) |

So habits is cleanly removable, and **focus is not**: deleting
`src/features/focus` breaks habits' build in four files.

**These counts are now measured, not maintained.** `src/lib/featureBoundaries.test.ts`
scans the source, declares each edge below with its reason, and asserts the set exactly —
so a new edge fails CI, and an edge that gets severed fails too, telling you to delete its
line here. The list can no longer drift in either direction.

| # | Coupling | Evidence | Why it blocks a clean lift |
|---|----------|----------|----------------------------|
| C1 | **Shared shell → feature reverse dep** | `AppShell.tsx` imports `useInventoryReminderCount` for the nav badge | Deleting `src/features/inventory` **breaks the shared shell's build** |
| C2 | **Feature server code outside the feature folder** | 6 route handlers in `src/app/api/inventory/*` import `features/inventory/lib/{aiCapture,productLookup,r2}` | The inventory server surface isn't co-located; it can't be dropped as one directory |
| C3 | ~~inventory → focus `logActivity`~~ | **Resolved.** `InventoryDashboard` no longer imports from focus; there is no inventory→focus edge anywhere. | — |
| C4 | **habits → focus** (5) | `subscribeSessions` + `FocusSessionRecord` in `useFocusSessions`; `FocusSessionRecord` in `FocusCorrelationCard`; `cancelPush`/`schedulePush` in `useHabitReminders`; `focusData` in `trackableSources`. *Was 7:* both habits dashboards imported `logActivity` through `focusData`, which only re-exports it from the feature-neutral `@/lib/activityLog` — the C3 shim. They now import it directly, so two edges were never product coupling at all | Focus can't be lifted out without habits following. The push import also contradicts the rule stated in `features/filing/lib/push.ts` — that a feature must never import another, which is why filing *copied* it |
| C5 | **habits → inventory** (2) | `subscribeItems` + `releasedOn` in `trackableSources.ts` | Habits' "trackable sources" reads inventory directly |

C4 and C5 are **not accidents** — habits correlating with focus sessions and
inventory activity is a product feature. They are listed so the coupling is a
deliberate choice rather than a discovery made mid-extraction. Severing them means
injecting the data (as C3 was resolved) or accepting duplication.

Everything else is already clean: its own Firestore collections
(`inventoryItems/locations/wishlist/lending/borrowed/…`), its own hooks, and only
**read-only** inbound reads of other pillars' localStorage
(`useBookmarkLibrary`, `useFocusProjects` — no code import, no writes).

## 2. Concrete decoupling steps (do these to make it a one-folder drop)

1. **C1 — invert the badge dependency.** Move the reminder count behind a prop or
   a small registration hook the shell reads, or gate the import behind a feature
   flag. Target: `AppShell` no longer statically imports `features/inventory/*`.
   *(Cleanest: `AppShell` accepts an optional `badges` prop supplied by a
   composition layer; the inventory count registers itself.)*
2. **C2 — co-locate or namespace the API routes.** Keep the route files where
   Next needs them but make each a thin shell that only imports from
   `features/inventory/lib/*`; or, for the spin-out, port those `lib/*` modules
   (already React-free + unit-tested) verbatim to the new app's `src/server/`.
3. ~~**C3 — inject the activity logger.**~~ **Done** — neither inventory nor habits
   imports `logActivity` from focus; both use `@/lib/activityLog`. The pattern it used
   (move the shared helper somewhere feature-neutral, or inject it) is the template for
   C4 below. Worth noting how the habits half was missed for so long: `focusData` still
   *re-exports* `logActivity`, so the import kept working and looked like a real
   dependency. A compatibility shim left in place is a coupling that reads as intentional.
4. **C4/C5 — only if focus or inventory is the pillar being lifted.** Habits is
   the one reaching out, so extracting *habits* needs nothing here. Extracting
   *focus* or *inventory* means habits must get its sessions/items injected the
   same way C3 was solved. The `push.ts` import is the odd one out: it is not a
   data dependency, and the repo's stated convention (see the header of
   `features/filing/lib/push.ts`) is to copy the module. That would make a third
   copy, so whether to copy it or promote `push.ts` to `src/lib/` — the
   `/api/push/*` routes already being shared infrastructure — is an open call.

Each step is small and independently shippable; none requires a data migration.

## 3. Mobile path — two existing strategies, reconciled

The repo already contains **both** approaches. They are not in conflict — they're
sequential:

| Path | State | Best for |
|------|-------|----------|
| **PWA** | ✅ shipped (`manifest.ts`, `sw.js`, install prompt) | Free distribution today; installed-PWA push works on iOS 16.4+ |
| **Capacitor shell** | ~60% built (`capacitor.config.ts`, `CAPACITOR_IOS.md`, working `TimerAlert` plugin loading the live site) | Fastest route to a **store listing** (~1–2 wks of Guideline-4.2 hardening) |
| **Expo/React Native rewrite** | planned (`MYSTUFF-NATIVE-PLAN.md`, ~5–7 wks) | A true native My Stuff app; the `lib/*` modules port unchanged (tests included) |

**Recommended sequence (lowest risk → most native):**
1. Keep the **PWA** as the free tier of distribution.
2. Ship the **Capacitor** store build first (Play, then App Store) with 4.2
   hardening: offline shell + native barcode + local notifications (the last two
   reuse Tier-1 engagement work in `ENGAGEMENT-ROADMAP.md`). This gets you *in the
   stores* — your docs call that "the actual biggest gap."
3. Do the **decoupling** (§2) in parallel — it's a prerequisite for a clean Expo
   spin-out and low-risk on its own.
4. Only after a store listing is live + retention is visible: the **Expo** native
   My Stuff app, reusing the ported `lib/*` and the **same Firebase project** so
   the web and native apps share `users/{uid}` data during the transition. Bookmark
   Deck then slims back to bookmarks/focus/habits.

## 4. Readiness checklist

- [x] **C1: `AppShell` no longer imports `features/inventory`** — badge injected via
  `AppShellHost` (the sole composition point that knows about inventory).
- [x] **C2: inventory API routes only import `features/inventory/lib`** — already
  directionally clean (route → feature lib, never feature → route); they port with
  the feature. No dependency inversion needed; the only remaining work is physical
  co-location at extraction time.
- [x] **C3: activity logging neutralized** — `logActivity`/`ActivityType` moved to
  `@/lib/activityLog`; neither inventory nor habits imports it from `@/features/focus`.
- [x] **The boundary is enforced, not just documented** — `src/lib/featureBoundaries.test.ts`
  fails CI on any cross-feature import not declared in the C4/C5 table above, and on any
  `@/features/*` import in `AppShell.tsx` (the C1 regression).
- [ ] Confirm the `lib/*` modules stay React-free (they are today) so they port to Expo
- [ ] Capacitor 4.2 hardening: offline shell · native barcode · local notifications · share-target
- [ ] Decide monetization/billing before the store build ships metered features (`MONETIZATION-PWA.md`)

> **Status:** the three code-coupling threads (C1–C3) are resolved —
> `src/features/inventory` now imports **no other feature**. My Stuff is a true
> one-folder extraction (plus removing the `/inventory` nav entry + `AppShellHost`
> line). What remains is the mobile-build work itself (Capacitor hardening / Expo),
> not decoupling.

**Bottom line:** My Stuff is ~90% decoupled; three small, well-scoped changes make
it a true one-folder extraction. The mobile app is a distribution project, not a
rewrite gate — Capacitor gets you listed in weeks; Expo is the longer native play,
and the decoupling above is the bridge between them.
