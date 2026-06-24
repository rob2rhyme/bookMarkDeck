# Habits feature — developer notes

The habit tracker is the third pillar of Bookmark Deck (after bookmarks →
resources and focus → the work). It is self-contained under
`src/features/habits/` plus the `/habits` route, mirroring the focus feature.

User-facing help lives at `/habits/guide`; this file is the engineering map that
used to be appended to that page.

## Isolation

Shared-file touches are additive only: a nav entry in `AppShell.tsx`, a `Repeat`
icon in `icons.tsx`, and two members on the focus `ActivityType` union. Removing
the feature ≈ delete the folder, the route, and those few additive lines.

The `/habits` route renders `HabitsRoute`, which picks between two presentations
of the **same** data:

- `SimpleHabitsDashboard` — beginner-first (default), and
- `HabitsDashboard` — the full "Classic" dashboard (kept byte-for-byte; never
  edit it when changing the Simple view).

The choice is persisted per-device in `src/lib/habitsViewSettings.tsx`
(`bd:habits-view:v1`), modeled on `cursorSettings.tsx`.

## Data model (Firestore)

- `users/{uid}/habits/{habitId}` — habit definitions.
- `users/{uid}/habitEntries/{habitId}_{YYYY-MM-DD}` — one per-day log
  (deterministic id ⇒ idempotent, offline-safe). Holds `status` (done/skipped),
  `count`, optional `note` + `at`.
- No new security rule — the repo's recursive owner rule
  (`match /users/{uid}/{document=**}`) already scopes it. See
  `src/features/habits/FIRESTORE_RULES.md`.

## Streak engine (derive, don't store)

`lib/streak.ts` computes all stats purely from the entry log + schedule — streaks
are never a stored counter that can drift. `isDueOn()` decides scheduling; a day
is a success when an entry is `done` and its `count` meets the target. Day keys
are local `YYYY-MM-DD` via `lib/day.ts` (DST-safe). Covered by `lib/streak.test.ts`
and `lib/insights.test.ts`.

## State & sync

`hooks/useHabits.ts` owns state: hydration-safe `localStorage` cache, optimistic
writes, and a live `onSnapshot` (entries windowed to ~13 months) through
`data/habitData.ts`. `hooks/useHabitSync.ts` reflects the Firebase auth session;
the Simple view auto-connects once when the user is already signed in.

Water habits (measurable, cup/glass unit, water-y name) mirror 1:1 with the
focus hydration tracker — see `lib/water.ts`.

Pure helpers: `serialize.ts`, `insights.ts`, `templates.ts`, `format.ts`.

## Components

`SimpleHabitsDashboard` / `HabitsDashboard` compose `SimpleHabitCard` /
`HabitCard` + `HabitRing`, `CreateHabitModal`, `LogDetailModal`
(note/time/status), `HabitOnboarding` (templates), `InsightsPanel` (charts +
heatmap), `SyncStatusChip`, and `FocusCorrelationCard`.

## Verify

`npm run typecheck`, `npm test`, `npm run build`, plus a manual smoke check.
Per-habit push reminders and a focus↔habits correlation are built in; an AI
"coach" layer was prototyped then removed to keep the app key-free.
