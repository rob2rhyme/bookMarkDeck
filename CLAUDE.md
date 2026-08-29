# CLAUDE.md — bmarkdeck (Bookmark Deck)

Source of truth for working in this repo. If code and this file disagree, fix the file.

## What this app is

**Bookmark Deck** — a calm, private home for the sites and apps you use most: bookmarks
(organized into nestable folders) and app shortcuts (web links). It is being grown
into a **focused-work hub** (see `FOCUS-INTEGRATION.md`): bookmarks (resources) → focus
sessions (the work) → a record of progress. *Connection over breadth.*

## Stack

- **Next.js 16** (App Router) · **React 19.2.6** · TypeScript · `reactCompiler: true`.
- **next-auth v4** (Google provider) for the Next.js session.
- **Firebase / Firestore (NoSQL)** for per-user cloud data, accessed **client-side**.
- **Tailwind CSS v4** (utility classes; dark slate theme).
- Deployed on **Vercel**. CSP + security headers set in `next.config.ts`.
- Also in the repo (do **not** disturb when doing web work):
  - `src/utils/googleDriveSync.ts` — a **Google Drive sync** path.

## Auth — dual-layer (important)

Two independent auth systems, by design:

1. **next-auth (Google)** — owns the Next.js *session*.
   - Server: `const session = await getServerSession(authConfig)` from `@/auth/auth.config`;
     redirect to `/login` if absent (see `src/app/(app)/page.tsx`).
   - Client: `const { data: session } = useSession()` (next-auth/react).
   - Config: `src/auth/auth.config.ts` (Google, default scopes only — `openid email profile`).
     Route handler: `src/app/api/auth/[...nextauth]/route.ts`.
2. **Firebase Auth (Google)** — owns access to *Firestore*, keyed by Firebase `uid`.
   - `ensureFirebaseGoogleAuth(emailHint)` in `src/lib/firebase.ts` signs the user into Firebase
     (using the next-auth email as `login_hint`) and returns the Firebase `User`.
   - Firestore reads/writes happen **client-side** and are scoped by `user.uid`.
   - **One login → all pillars synced:** `FirebaseSyncBridge` (mounted in `src/app/(app)/layout.tsx`)
     exchanges the next-auth Google **id_token** — captured on the JWT in `auth.config.ts`, served by
     the session-gated `src/app/api/firebase-token/route.ts` — for a Firebase session via
     `bridgeFirebaseFromIdToken` (`signInWithCredential`, silent, no popup) on the first authenticated
     load when no session is restored. So a single Google sign-in covers every pillar's Firestore sync
     instead of each prompting "Sign in to sync." **Best-effort:** on failure the interactive
     `ensureFirebaseGoogleAuth` path remains the fallback (no regression). Fully zero-click requires the
     next-auth Google OAuth client ID whitelisted on the Firebase project's Google provider; otherwise
     it degrades to one tap that lights up all pillars.

**Reuse both — never add a second auth system or a second database.**

## Data model (Firestore)

- One document per user: **`users/{uid}`** holds arrays/fields: `bookmarks[]`, `folders[]`,
  `shortcuts[]`, plus `*UpdatedAt` timestamps. Written with `setDoc(ref, {...}, { merge: true })`.
- Subcollection in use: **`users/{uid}/bookmarkBackups`**.
- Access helpers: `src/utils/firestoreBookmarks.ts`, `src/utils/firestoreShortcuts.ts`.
  Pattern: `const ref = doc(db, "users", uid)` after `ensureFirebaseGoogleAuth(...)`.
- **"Collections" in product terms = `folders`** (`src/types/folder.ts`: `id`, `name`,
  `parentId` — nestable). A folder's bookmarks are `bookmarks.filter(b => b.folderId === folder.id)`.

### Firestore security rules
Rules live in the committed **`firestore.rules`** at the repo root (wired via `firebase.json` →
`.firebaserc`, project `unified-project-440e5`): a single owner-scoped recursive rule
`match /users/{uid}/{document=**}` allowing read/write only when `request.auth.uid == uid` —
which covers every collection, since all user data lives under `users/{uid}`. Per-feature notes:
`src/features/{focus,habits,inventory}/FIRESTORE_RULES.md`. **Caveat:** Firestore evaluates the
**console-deployed** ruleset, and no CI step deploys this file, so the repo copy and production
can drift — verify/deploy after changing it (`firebase deploy --only firestore:rules`).
`npm run verify:rules` checks the repo copy against the Firestore emulator (40 assertions:
owner access, cross-uid denial, anonymous denial, no leak outside `users/{uid}`); it needs Java
plus a running emulator so it stays out of CI, and it proves the file is right, not that
production matches it. Any new
collection must stay under `users/{uid}` (or get its own owner-scoped rule).

## State & persistence pattern (hooks own state)

See `src/hooks/useShortcuts.ts` / `useBookmarks.ts`:
- Hook **owns** state; starts from a safe default (`useState([])`).
- **Hydration-safe:** load from `localStorage` inside `useEffect` (after mount), then set a
  `hydrated` flag. No `localStorage` or `Date`/UA reads during initial render.
- `localStorage` is a **per-user cache** (key suffixed with `userId`).
- Cloud sync to/from Firestore is **explicit** (`syncToCloud*` / `syncFromCloud*`), not automatic.
- Components are presentational; hooks expose a stable public API.

## Routing & shell

- Route groups: **`(app)`** (authenticated app) and **`(auth)`** (`/login`).
- `src/app/(app)/layout.tsx` wraps pages in `<AppShell>` (`src/components/AppShell.tsx`) +
  `<GlobalClientUI>`. `AppShell` renders the header (logo + pillar nav pills + account
  menu), a mobile bottom nav (pillars + ⌘K search), and the footer
  (Guide / Privacy / Terms / FAQ).
- Existing pages: `/` (home), `/folders/[folderKey]`, `/folders/manage`, `/folders/unstaged`,
  `/focus`, `/habits`, `/habits/guide`, `/inventory`, `/filing`, `/guide` (site guide),
  `/faq`, `/privacy`, `/terms`, `/login`.

## Styling

Tailwind v4 utility classes. **Keep writing dark-first, exactly as before**: `bg-gradient` over
`slate-950/900`, text `slate-50`, muted `slate-400/500`, accent `blue-500/400/300`, pill chrome
`rounded-full border-slate-800 bg-slate-900`. Match these tokens — no inline styles, no foreign
styling approach.

### Theme (light + dark)

Both themes are driven from one place: the token map at the top of `src/app/globals.css`. Dark is
the default; a `light` class on `<html>` re-points the whole palette. **Components are unaware of
theme** — they use the ordinary `slate-*`/`blue-*` utilities and get both themes for free.

- **How.** `@theme inline` maps each `--color-*` to a `--bd-*` variable; `:root` holds Tailwind's
  own values (so dark is unchanged) and `.light` holds the mirrored ramp. Because the app is
  written dark-first — the background end of the ramp is the high numbers, the foreground end the
  low numbers — mirroring (`n → 1000-n`) carries the meaning across intact.
- **The `--bd-*` indirection is load-bearing, don't remove it.** Pointing `--color-*` straight at
  a hex lets the minifier constant-fold opacity modifiers (`bg-slate-900/80` → `#0f172acc`), which
  then stops tracking the variable and keeps its dark value in light mode.
- **The one rule when writing new UI:** never pair a literal `white`/`black` with a ramp token on
  the same element (e.g. `bg-white text-slate-900`). Literals don't theme, so the pair breaks in
  one mode. Use ramp tokens on both sides — `bg-slate-50 text-slate-950` reads as "inverted
  surface" in both themes. `text-white` on a saturated `bg-blue-500`/`bg-red-500` ground is fine;
  those grounds stay dark in light mode.
- **Adding a palette step.** The map covers exactly the family/step pairs the codebase uses. A new
  one needs three lines (`@theme inline`, `:root`, `.light`) or it silently keeps its dark value.
- **Setting.** `theme: "system" | "light" | "dark"` on `AppearanceSettings`
  (`src/lib/appearanceSettings.tsx`), chosen in the account-menu Appearance panel, applied by
  `AppearanceApplier`, device-local like fonts and cursors. A blocking inline script in
  `layout.tsx` sets the class before first paint (no flash); it duplicates the storage key by
  necessity, so keep the two in sync.
- **Outside Tailwind's reach**, and handled separately: `public/offline.html` (follows the OS),
  `viewport.themeColor` in `layout.tsx`, and `manifest.ts` (stays dark — install splash).
- Semantic aliases (`--bd-page`, `--bd-surface`, `--bd-border`, `--bd-text`, `--bd-text-muted`,
  `--bd-ring`, `--bd-shadow-card`) exist for CSS that can't use utilities. Prefer utilities.

## Environment variables

Client (`NEXT_PUBLIC_*`, read in `src/lib/firebase.ts`):
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
Server (next-auth): `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
Secrets live only in the gitignored `.env.local`. `.env.example` is the annotated
full list (next-auth, Firebase, and the optional push/QStash/UPC-lookup/AI-capture/R2
sets — AI capture = `ANTHROPIC_API_KEY` + optional `AI_CAPTURE_MODEL`).
Owner-deferred config decisions live in `FUTURE-PLANS.md`.

## Commands & CI

- `npm run dev` — dev server.
- `npm run lint` → `tsc --noEmit` · `npm run typecheck` → `tsc --noEmit` · `npm run build` → `next build`.
- `npm run test` → `vitest run` (`npm run test:watch` for watch mode). A **Vitest** suite
  exists — pure-logic unit tests (no component/E2E) covering `src/utils`, `src/lib`, and the
  `focus`/`habits` feature `lib/` helpers (streaks, formatting, exports, mood, settings, etc.).
- "Verify" = lint + typecheck + build + `npm run test`, plus a **manual smoke check**:
  login, bookmark sync, Drive sync.
- CI: `.github/workflows/ci.yml` runs `typecheck` + `test` + `build` (root) on
  PRs/pushes to `main`, with dummy env vars. Vercel builds previews.

## Dependency security note

`package.json` `overrides` pin patched transitive versions and intentionally **cap**
`protobufjs <8` and `@grpc/grpc-js <2` for firebase/grpc compatibility. Don't loosen these
caps without re-verifying firebase. `postcss >=8.5.23 <9` is a security floor that also
dedupes the tree onto one copy: `next` pins postcss *exactly*, so if an advisory ever covers
that pinned version only the override can raise it.

Prefer bumping the real dependency over adding an override: `next >=16.3` is what carries
patched `sharp` and `postcss`, so it holds the fix for those two.

Known latent issue: `@capacitor/cli` 8.5+ adds `xcode`, which pulls `uuid@7` (GHSA-w5hq-g745-h8pq,
moderate). The committed lockfile stays on 8.4.1 and is clean; regenerating the lockfile
reintroduces it. macOS-only iOS tooling, never built on CI or Vercel.

## Focus feature (`/focus`)

A self-contained "focused-work hub" (see `FOCUS-INTEGRATION.md`). Fully isolated
under `src/features/focus/` + the `/focus` route; removable cleanly.

A **task-centric work tracker + journal** (not coupled to bookmarks).

- Route: `src/app/(app)/focus/page.tsx` — auth-gated like home.
- UI: `FocusDashboard` composes `PomodoroTimer`, `TaskTracker`, `AnalysisPanel`,
  `JournalCard`, `HydrationTracker`, `MeditationCard`, `QuoteBox`,
  `FocusSettingsModal`. A sticky `SectionNav` (`@/components/SectionNav`) jumps
  between the dashboard's sections.
- Persistence (opt-in): `useFocusSync` reflects an existing Firebase session
  silently (`onAuthStateChanged`) or connects on demand. Data layer
  `features/focus/data/focusData.ts` writes per-user subcollections:
  `focusTasks` (reusable, time-tracked), `focusSessions`
  (`{ focusMin, day, createdAt, taskId? }`), `focusSettings/settings`,
  `focusJournal/{YYYY-MM-DD}` (`{ mood }` + legacy `note`),
  `focusNotes/{id}` (multiple timestamped notes/day), `focusHydration/{day}`
  (`{ cups }`), `activity/{id}` (unified log), `focusScores/{id}` (one doc
  per answered "Need a push?" quiz — points/topic for Scores history), and
  `meditationSessions/{id}` (`{ minutes, kind, pattern?, day, createdAt }`).
  Optimistic
  + fail-safe. Rules: `src/features/focus/FIRESTORE_RULES.md` (deployable
  `firestore.rules`).
- Tasks (`useFocusTasks`): reusable across days; an **active task** receives the
  timer's focus minutes (via `taskId` on sessions); auto-resumes the most recent;
  mark done / archive. Per-task time is derived from `focusSessions` (not stored).
- Timer (`useFocusTimer`): settings-driven, timestamp-based (accurate when
  backgrounded), Web Audio chimes (`lib/sound.ts`) + notifications (`lib/notify.ts`),
  auto-start; attributes blocks to the active task.
- Analysis (`useFocusStats` + `AnalysisPanel`): daily goal progress, streak,
  7-day chart + mood trend, weekly top tasks — from `focusSessions` + journal.
- Journal (`useFocusJournal` + `JournalCard`): per-day mood (`lib/mood.ts`,
  rendered via `MoodIcon`) + **multiple timestamped notes/day** (`focusNotes`);
  prompted after a focus block.
- Timer alert: `useFocusTimer` exposes `alert`/`dismissAlert`; `PomodoroTimer`
  shows a full-screen `TimeUpModal` (repeating chime) on end, plus a persistent
  system notification via the background push (`sw.js`) for backgrounded/closed.
- Settings (`useFocusSettings`): durations, sessions-until-long, auto-start,
  sound (+ test), hydration prefs, daily goal, **interests** (topic list) —
  localStorage + Firestore.
- "Need a push?" (`QuoteBox`): interest-aware (`lib/topics.ts` — Music/Math/
  Astronomy/Coding/General). Quotes filter by `settings.interests`; an
  interactive `QuizBox` awards points → `useFocusScores` (`focusScores`) +
  `activity` (`quiz`), surfaced in `ScoresPanel`. Code nugget/challenge show only
  for code-leaning interests. Empty interests = original coding/general behaviour.
- Hydration (`useHydration`): cups/day (oz derived), localStorage cache +
  Firestore sync (`focusHydration/{day}`, load-on-connect max-merge) + `QuoteBox`.
- Shared-file touches (additive only): `AppShell.tsx` (Focus nav pill, mobile-safe),
  `icons.tsx` (`Timer`, `Settings`).

## Filing feature (`/filing`)

*Where every paper lives — and what's due next.* A self-contained pillar under
`src/features/filing/` + the `/filing` route (see `ANALYSIS-FILING-LOG.md`).
Removable cleanly; never imports another feature.

Bookmark Deck's job is **retrieval** — bookmarks answer "where is it?" for the
digital world, Filing answers it for the physical one. A `Party` is a *label on a
folder* ("Mom's", "Client: Acme") inside one owner's account — **not** household
multi-user, which stays ruled out. Nobody else signs in.

- Route: `src/app/(app)/filing/page.tsx` — the same 15-line auth gate as `/inventory`.
- UI: `FilingDashboard` composes `UpcomingPanel`, `ShredQueue`, `PlaceManager`,
  `PartyManager`, `FolderFormModal`, `DocumentFormModal`, `FolderPapersModal`,
  `ObligationsModal`, `CustodyModal`, `WhereIsPaperModal`, `LabelPrintModal`,
  `ActivityTimeline`, `FilingSettingsModal`, `BookmarkLinkModal`, `ExpiryPanel`,
  `FilingInsights`.
- Collections (all under `users/{uid}/`, so **no `firestore.rules` change**):
  `filingPlaces`, `filingParties`, `filingFolders`, `filingDocuments`,
  `filingSettings/settings`. Notes: `src/features/filing/FIRESTORE_RULES.md`.
- **Scale:** places/parties/folders cache whole; documents are subscribed whole but
  cached **slim** — only the fields the list, search, badge and queues need.
  `subscribeDocuments(folderId?)` exists so per-folder lazy loading is a one-line
  change past a documented threshold.

Three model decisions worth not re-litigating:

1. **Checked out is `currentPlaceId !== homePlaceId`** — there is no flag, so the
   two can never disagree. `lib/custody.ts`.
2. **Retention runs from the calendar-year-end cutoff of `coversThrough`**, not
   from when you filed it. 2024 papers filed in March 2025 age out on
   **2031-12-31**, not 2032-03-something. `lib/retention.ts`.
3. **A folder inherits the LONGEST retention of its contents** — one permanent
   paper makes the whole folder permanent.

Other invariants:

- **`nextDueOn` is derived and restamped on every write** (`withDerived` in
  `useFilingDocuments`). A stale cache is what makes the badge lie.
- **Completing a repeat rolls forward exactly one period**, so three missed months
  read as still overdue rather than silently skipping ahead.
- **Expiry is its own lens, not a reminder.** `lib/expiry.ts` + `ExpiryPanel`
  list everything with a validity date (`kind` of `expires` or `renew`) —
  including the licence that's fine for three more years — because "what do I
  hold and when does each lapse" is a different question from "what's due".
  Bands are expired / ≤30d / ≤180d / ok: renewing a passport is not a same-week
  job. An obligation records the `presetId` it came from, which is how the
  **passport six-month travel-validity rule** is applied — many countries refuse
  entry below six months' validity, so a passport can be in date and still get
  you turned away. That cutoff is computed, flagged, and captioned as a default
  to check per destination.
- **`lib/stats.ts` + `FilingInsights` derive everything from the activity
  timelines**; nothing new is stored. Consequence, stated in the UI: each
  timeline is capped at `MAX_ACTIVITY` (300), so a long-lived record's earliest
  events age out and the figures are recent history, not an audit ledger. Charts
  are single-series magnitude, so one hue with direct labels — no legend, no
  categorical palette.
- **Nothing is ever destroyed on a timer.** The shred queue is a review queue;
  "shred" archives and writes a `shredded` receipt to the activity timeline. A
  folder's `keepReason` mutes the reminder **without touching the clock**.
- **`useFilingReminderCount` reads localStorage only** — obligations due + papers
  to clear + folders overdue back — so the shared shell never pulls Firebase into
  its bundle. Same constraint as `useInventoryReminderCount`.
- Retention and renewal presets are **labelled defaults, not authority**; both
  surfaces carry a visible "general guidance, not legal or tax advice" line.
- **Push is a DAILY DIGEST, not an alarm per obligation.** `/api/push/schedule`
  clamps QStash delays to 24h, so a renewal months out can't be queued when it's
  created. One message a day, re-armed whenever you open `/filing`
  (`useFilingPush` + `lib/digest.ts`). Consequence, stated in the UI: stop
  opening the app and the digest pauses. The badge and panel stay current.
- **`lib/push.ts` is COPIED from `features/focus/lib/push.ts`, not imported** —
  a feature never imports another feature. The `/api/push/*` routes are shared
  infrastructure, so calling those is fine.
- **The `.ics` is a file to import, not a feed to subscribe to.** A live feed
  means a publicly-fetchable URL carrying someone's paperwork; deliberately not
  built. All-day `VALUE=DATE` events, so no timezone or DST question arises.
- **The bookmark↔document link is the pillar's stated condition** — a paper
  points at the bookmark for its account, so the policy in Drawer 2 and the
  insurer's login page are one record. `lib/bookmarks.ts` READS the core
  bookmarks localStorage cache (`bookmarkdeck:v2:{email}`) rather than mounting
  `useBookmarks`: a one-way read-only dependency on core, not a second
  subscription to the same data. Keep the key in sync with
  `storageKeyV2ForUser`.
- **Import merges by id and NEVER deletes** (`lib/exportFiling.ts`), so
  restoring a stale backup can't remove what's been filed since. Each hook's
  `importMany` also writes through to Firestore, or an import would be stranded
  on one device. JSON round-trips; CSV is export-only and lossy by design.
- **Attachments (scans/PDFs) are NOT built.** The model reserves
  `hasAttachment` + a `filingDocs` subcollection, but the upload path would need
  its own presign route and a copied R2 client (inventory's are feature code and
  can't be imported). Index-first stands: the pillar is about finding paper, not
  storing it.
- Shared-file touches (additive only): `AppShell.tsx` (nav pill + the `short`
  labels the six-cell bottom nav needs), `icons.tsx` (`Cabinet`),
  `AppShellHost.tsx` (badge), `CommandPalette.tsx`, `src/lib/filingIntent.ts`,
  `icons.tsx` (`Clock`, `BarChart`).

## Git & PR workflow

- **Default: ship each fix via a PR and merge it.** For every change, open a pull
  request and merge it into `main` once verification passes (lint + typecheck +
  build + `npm run test`) — do this without asking. Only pause to ask first when
  there's urgency or risk that warrants a check (e.g. a large/irreversible change,
  ambiguous requirements, or a failing/blocked CI). Standing owner preference.

## Conventions

- File comments are sparse; match the surrounding density. `@/` is the `src/` alias.
- Follow existing patterns exactly; prefer the smallest diff to shared files.
