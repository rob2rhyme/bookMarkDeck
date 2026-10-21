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
2. **Streak-at-risk nudges** (Focus + Habits) — `[net-new]`. `useFocusStats.streak`
   / `HabitStats.currentStreak` + `schedulePush` exist; reminders currently fire a
   generic "Time for X", never streak-framed. Wire a streak-framed `reminderBody`
   in `useHabitReminders.ts` + a Focus evening nudge.
3. **Push-when-closed reminders** (My Stuff: warranty/return/use-by/maintenance) —
   `[planned, "Fill — high retention"]`. `lib/value.ts` `attention()` already
   computes what to schedule.
4. **Consumable depletion + restock loop** (My Stuff pantry/self-care) —
   `[planned, ITEM-PROFILES Phase 2]`. Add `restockAt` to `types.ts`, "–used one"
   on `ItemCard`, a new Attention bucket, one-tap wishlist re-add. The only
   mechanic that gives food/self-care a **daily** reason to open the app.
5. **Bookmarks "Rediscover" nudge** — `[net-new]`. Reuse `hits`/`lastUsedAt`,
   mirror inventory's `rediscover.ts`.

## Tier 2 — strong wins, modest effort

- **Milestone badges** (all pillars, `[net-new]`) — derive from existing logs
  (`insights.ts`, `focusSessions`, `HabitStats`); calm dismissible cards, **no
  points economy**. Fixes Focus's gamification being trivia (`focusScores`)
  decoupled from actual output.
- **Weekly recap card** (all pillars, `[net-new]`) — data already computed
  (`useFocusStats` week-vs-week, `habits/lib/insights.ts`), just not surfaced.
- ~~**PWA `share_target` + save-current-page**~~ — **shipped**: `manifest.ts`
  `share_target` → `/share` (Android; iOS has no web share target). See CLAUDE.md
  → Routing & shell.
- **Auto-fetch title/favicon/description on add** (Bookmarks, `[net-new]`).
- **Onboarding parity** (Bookmarks + Focus, `[net-new]`) — clone Habits'
  15-template onboarding (`HabitOnboarding.tsx`), the best first-run in the app.

## Tier 3 — competitive gaps (bigger, still on-stack)

- **Bookmarks:** importers (Pocket/Raindrop/Chrome via `parseBookmarkHtml.ts`);
  read-later/reader-view + highlights; tag-browse.
- **Focus:** recurring to-dos + priorities (`useTodos.ts`); two-way calendar
  write-back (currently read-only); ambient soundscapes (Web Audio, matches
  `lib/sound.ts`).
- **Habits:** multiple/snooze reminders; external auto-tracking (Google Fit/Health
  → `trackableSources.ts`); a Finch-style companion (biggest lift, brand call).
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
