# Engagement, UX & Competitive-Gap Roadmap

_Cross-pillar plan grounded in the code and the existing strategy docs
(`ANALYSIS-MYSTUFF-NEXTLEVEL.md`, `INVENTORY-ROADMAP.md`,
`ANALYSIS-MOBILE-APP-STRATEGY.md`, `MYSTUFF-NATIVE-PLAN.md`, `FUTURE-PLANS.md`).
`[planned]` = owner already scoped it; `[net-new]` = proposed here._

## Headline

The app already **out-features its competitors on its brand axes** — price
comparison, per-item life history, cross-domain smart forms, unlimited-free,
on-device privacy capture, and the cross-pillar hub (uncopyable without building
four apps). The real gaps are **re-engagement, light gamification, onboarding
parity, and distribution** — not catalog features.

> **The single biggest unlock:** the whole notification layer is built but
> **dark**. Web Push (`src/features/focus/lib/push.ts` → QStash) and the data it
> needs (focus/habit streaks, inventory `attention` buckets) already exist, but
> push **silently no-ops** until `VAPID_*` / `QSTASH_*` env vars are set
> (owner-deferred in `FUTURE-PLANS.md`). Turning those on unlocks ~5 of the
> highest-retention items below.

## Tier 1 — highest impact × already-built infra

1. **Turn on push** (VAPID/QStash env vars) — `[planned]`, config not code.
2. ~~**Streak-at-risk nudges** (Focus + Habits)~~ — **shipped**: habit reminders use
   `reminderBody` with the live streak ("Keep your 12-day streak alive — Meditate
   today.", from 2 days up; `useHabitReminders`) and Focus sends an 8 pm "keep your
   focus streak" push while a streak is at risk and no session is logged
   (`useFocusStreakNudge`). Both ride the push infrastructure, so they stay silent
   until item 1 is turned on.
3. **Push-when-closed reminders** (My Stuff: warranty/return/use-by/maintenance) —
   `[shipped]`. One daily digest, Filing's design: `lib/digest.ts` summarises
   `attention()` (same count as the nav badge), `useInventoryPush` re-arms it when
   My Stuff is opened, and the 🔔 Reminders dialog holds the opt-in and the hour.
   Same limit as Filing's: the 24 h QStash clamp means it pauses if the app isn't
   opened for a day. Silent until item 1 is turned on.
4. ~~**Consumable depletion + restock loop**~~ — **shipped**: `restockAt`, "used one" on
   cards, the *running low* Attention bucket (counted in the badge and digest), and
   one-tap "+ Wishlist". The loop closes on **Got it**: a wish made from an item that
   is running low carries `restockOf`, and "Got it" adds one to that item (with Undo)
   instead of creating a second copy — `applyRestock`. The only mechanic that gives
   food/self-care a **daily** reason to open the app.
5. ~~**Bookmarks "Rediscover" nudge**~~ — **shipped**: `RediscoverBookmarkCard` on the
   home page (`pickRediscoverBookmark` + `useRediscoverBookmark`), one pick a day from the
   least-recently opened links, favouring ones opened before, with a per-day "Not now".
   Only links untouched for 30+ local days qualify, so a library in active use shows no
   card rather than "rediscovering" yesterday's link.

## Tier 2 — strong wins, modest effort

- **Milestone badges** (all pillars, `[net-new]`) — derive from existing logs
  (`insights.ts`, `focusSessions`, `HabitStats`); calm dismissible cards, **no
  points economy**. Fixes Focus's gamification being trivia (`focusScores`)
  decoupled from actual output.
- ~~**Weekly recap card**~~ — **shipped** as "Your week" on the home page
  (`WeeklyRecapCard`, `@/lib/weeklyRecap`): focus, habits, bookmarks, notes, items.
- ~~**PWA `share_target` + save-current-page**~~ — **shipped**: `manifest.ts`
  `share_target` → `/share` (Android; iOS has no web share target). See CLAUDE.md
  → Routing & shell.
- ~~**Auto-fetch title/favicon/description on add**~~ — **shipped (title)**: a link added
  without a title is saved at once under its URL, then takes the page's own title
  (`og:title` → `twitter:title` → `<title>`) from `/api/link-title`, unless you named it
  meanwhile. Favicons were already derived from the URL; the description is deliberately
  not stored — a page summary isn't the reader's own note (same reasoning as Raindrop's
  excerpt).
- ~~**Onboarding parity** (Bookmarks + Focus)~~ — **shipped**: Habits' template-picker
  shape as a shared `StarterPicker`. An empty library offers "start with a few popular
  sites" (`@/utils/starterLinks`, filed into a folder per kind, reusing a same-named
  top-level folder, skipping links already saved); a Focus task list that has never held
  a task offers "a few common ones" (`features/focus/lib/starterTasks`). Both are offered
  from the empty state, never opened on their own — the first-run welcome already opens
  by itself, and a returning user on a new device should sync rather than be shown
  templates. `e2e/starters.spec.ts`.

## Tier 3 — competitive gaps (bigger, still on-stack)

- **Bookmarks:** ~~importers (Pocket/Raindrop/Chrome)~~ — **shipped**: browser HTML
  already; Raindrop CSV/HTML and Pocket CSV/HTML added (`parseServiceCsv`,
  `parseBookmarkHtml`); read-later/reader-view + highlights; tag-browse.
- **Focus:** (Soundscapes and two-way Google sync **shipped**: rain, brown noise, wind,
  ocean, soft noise, drone behind a running focus block, `lib/sound.ts`; completions and
  moves made in Google come back to mirrored to-dos, and the agenda adds/deletes events on
  the primary calendar.)
- **Habits:** health auto-tracking **shipped as an import** (Apple Health `export.zip`/
  `export.xml`, Google Takeout/Fit CSVs, or a plain CSV → `lib/healthImport.ts`), not a live
  link: Google Fit's API ends in 2026 and Health Connect/Apple Health are native-only, so a live
  feed waits for the native app wrapper. A Finch-style companion (biggest lift, brand call).
- **My Stuff:** AI photo→item capture — **already built** (`AiCaptureModal.tsx`),
  dormant behind a hidden button + missing `ANTHROPIC_API_KEY`. Ship as the
  premium tier **with** billing (see `MONETIZATION-PWA.md`), never ungated.

## Tier 4 — trust/UX fixes that lift conversion (trivial)

Un-auth-wall `/guide`+`/faq` pre-signup · custom `not-found.tsx` · unify the sync
UX · standardize modals (shared `Modal` vs hand-rolled overlays vs `window.confirm`).

## Distribution (your docs call it "the actual biggest gap")

Being in the app stores at all beats any single feature. The Capacitor shell is
~60% built (`capacitor.config.ts`, `CAPACITOR_IOS.md`, `nativeNotify.ts`); ~1–2
weeks of Guideline-4.2 hardening (offline shell + native barcode + local
notifications — reuses Tier 1 #3) gets a listing. See
`MYSTUFF-DECOUPLING-READINESS.md`.

## Deliberately NOT building (owner ruled out; agreed)

Household multi-user (data-model fork), insurance RCV/ACV, AI video capture,
public social shelves, whole-home finance/Plaid — each dilutes the calm/private
hub brand that is the moat.
