# CLAUDE.md — bmarkdeck (Bookmark Deck)

Source of truth for working in this repo. If code and this file disagree, fix the file.

## What this app is

**Bookmark Deck** — a calm, private home for the sites and apps you use most: bookmarks
(organized into nestable folders) and app shortcuts (web links). It is being grown
into a **focused-work hub** (see `FOCUS-INTEGRATION.md`): bookmarks (resources) → focus
sessions (the work) → a record of progress. *Connection over breadth.*

## Stack

- **Next.js 16** (App Router) · **React 19.2.8** · TypeScript · `reactCompiler: true`.
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
`src/features/{focus,habits,inventory}/FIRESTORE_RULES.md`. Any new collection must stay under
`users/{uid}` (or get its own owner-scoped rule).

Firestore evaluates the **deployed** ruleset, so the repo copy and production used to be able to
drift silently. **`.github/workflows/firestore-rules.yml` closes that gap** — on any change to
the rules files it proves the ruleset against the emulator, deploys it on merge to `main`, and
then reads the released ruleset back to confirm the deploy landed:

| Command | Answers |
|---|---|
| `npm run verify:rules` | is the **file** correct? (40 assertions: owner access, cross-uid denial, anonymous denial, no leak outside `users/{uid}`) — needs `FIRESTORE_EMULATOR_HOST` |
| `npm run verify:rules:emulated` | the same, booting the emulator itself (needs Java) — what CI runs |
| `npm run deploy:rules` | push the repo copy to production |
| `npm run check:rules` | is **production** running the repo copy? |
| `npm run check:sa <key.json>` | is this file a usable service-account key? (never echoes its contents) |

The deploy half needs the repo secret `FIREBASE_SERVICE_ACCOUNT` — a JSON key for a service
account holding **both** `roles/firebaserules.admin` (create rulesets, move the release) and
`roles/serviceusage.serviceUsageConsumer` (what firebase-tools needs to call project APIs as a
service account rather than a user). Service accounts live in the Cloud console, not the Firebase
one: console.cloud.google.com → IAM & Admin → Service Accounts, same project as `.firebaserc`.
Full steps are in the workflow header. Without the secret the deploy job skips with a notice
rather than failing, so forks still get the verification half. The last two commands read the same credential locally
via `GOOGLE_APPLICATION_CREDENTIALS`. `firebase-tools` is pinned in `package.json` and is
deliberately **not** a dependency — it's fetched by `npx -y`, so it can't drag transitive
advisories into the lockfile.

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
- CI: `.github/workflows/ci.yml` runs `actionlint` (workflows) + `typecheck` + `test` +
  `build` (root) on PRs/pushes to `main`, with dummy env vars. Vercel builds previews.
  **CI runs Node 22** (all four `setup-node` pins, across both workflows). That is
  load-bearing, not incidental: `jsdom` 30 requires `^22.22.2 || ^24.15.0 || >=26.0.0` and
  fails to load on Node 20, and `vite`/`rolldown` declare `^20.19.0 || >=22.12.0` floors.
  The trap it closed is worth remembering — a local Node of exactly `v22.22.2` ran all 785
  tests while CI on 20 reached 773, so "green locally" proves nothing about CI unless the
  runtimes match. Check `node -v` against the workflow before trusting a local run.
  actionlint is blocking and pinned: an invalid workflow expression fails at *startup*,
  producing a run with no jobs and no entry in the PR's check list, so the failure looks
  like nothing ran.
  `.github/workflows/firestore-rules.yml` is separate and path-filtered to the rules
  files — verify → deploy → read back (see **Firestore security rules** above). Its path
  filter includes **the workflow file itself**, so a change to that workflow is verified on
  its own PR rather than landing unproven until someone next touches the rules.

## Dependency security note

`package.json` `overrides` pin patched transitive versions and intentionally **cap**
`protobufjs <8` and `@grpc/grpc-js <2` for firebase/grpc compatibility. Don't loosen these
caps without re-verifying firebase. `postcss >=8.5.23 <9` is a security floor that also
dedupes the tree onto one copy: `next` pins postcss *exactly*, so if an advisory ever covers
that pinned version only the override can raise it.

Prefer bumping the real dependency over adding an override: `next >=16.3` is what carries
patched `sharp` and `postcss`, so it holds the fix for those two.

`@capacitor/cli` is pinned with a **tilde** (`~8.4.3`), not a caret, and that is
load-bearing: 8.5+ adds `xcode`, which pulls `uuid@7` (GHSA-w5hq-g745-h8pq, moderate).
Dependabot proposed `^8.4.3`; npm resolves that to **8.5.1**, and audit goes from 0 to 3
moderate. A dependabot `ignore` stops 8.5.x being *proposed* but cannot stop a caret from
*resolving* there — so the range has to hold the line, and regenerating the lockfile is
safe rather than something to avoid. macOS-only iOS tooling, never built on CI or Vercel.

### Dependabot: what is held back, and until when

`.github/dependabot.yml` ignores four packages at **specific versions**. Each is blocked on
a fix outside this repo; without the ignores they regenerate weekly (#255 was closed and
#268 reappeared with the same content inside the hour).

| Package | Ignored | Blocker | Unblocks when |
|---|---|---|---|
| `@capacitor/cli` | `8.5.x` | `xcode` → `uuid@7` | `xcode` drops `uuid@7`, or a deliberate Capacitor 6→8 migration |
| `vitest` | `4.1.10`, `4.1.11` | npm arborist crashes in `#loadPeerSet` walking vitest's optional peers | npm's resolver handles that peer graph |
| `typescript` | `7.0.x` | `typescript-eslint` does not support TS 7.0 | TS ≥7.1 (typescript-eslint#10940) |
| `eslint` | `10.x` | `eslint-plugin-react` uses the context API ESLint 10 removed | `eslint-config-next` supports ESLint 10 |

Two rules govern that file, both worth keeping:

- **Ignores name versions, never bare packages.** A bare `dependency-name` silences the
  release that *fixes* the problem along with the problem — which is how a repo ends up
  years behind on something nobody meant to freeze. This binds our own entries too: the
  `jsdom` `30.x` ignore was **removed** the moment CI moved to Node 22, because its stated
  cause was gone. An ignore that outlives its reason is a bug.
- **The `capacitor` group is FIRST in the `groups` map.** A dependency joins the first group
  it matches, and `dev-dependencies` would otherwise claim `@capacitor/cli`. The Capacitor
  packages are peer-bound — `@capacitor/ios` requires a matching `@capacitor/core` — so
  bumping one alone fails `npm ci` with `ERESOLVE`. Six PRs were closed unmergeable for that
  single cause before grouping fixed it; one PR moving them together is the only shape that
  resolves. Majors are included because 6 → 8 is the move that needs making.

`typescript` deserves one extra note: `npm run lint` is `tsc --noEmit`, and it **passes**
under TS 7.0 — only the separate `lint:eslint` pass fails. Since CI runs that one
non-blocking, a TS 7 bump merges green while silently breaking linting.

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
  `FilingInsights`, `AttachmentsModal`.
- Collections (all under `users/{uid}/`, so **no `firestore.rules` change**):
  `filingPlaces`, `filingParties`, `filingFolders`, `filingDocuments`,
  `filingSettings/settings`, `filingDocs` (attachment pointers). Notes: `src/features/filing/FIRESTORE_RULES.md`.
- **Scale:** places/parties/folders cache whole; documents are subscribed whole but
  cached **slim** — only the fields the list, search, badge and queues need.
  `subscribeDocuments(folderId?)` exists so per-folder lazy loading is a one-line
  change past a documented threshold.

Four model decisions worth not re-litigating:

1. **Checked out is `currentPlaceId !== homePlaceId`** — there is no flag, so the
   two can never disagree. `lib/custody.ts`.
2. **Retention runs from the calendar-year-end cutoff of `coversThrough`**, not
   from when you filed it. 2024 papers filed in March 2025 age out on
   **2031-12-31**, not 2032-03-something. `lib/retention.ts`.
3. **A folder inherits the LONGEST retention of its contents** — one permanent
   paper makes the whole folder permanent.
4. **A drawer's label is a RULE, and the rule is parsed, never stored.**
   `FilingPlace.contents` holds the text as typed — "A-J", "Taxes", "2019",
   "Misc." — because that text is what gets printed onto the sticker;
   `lib/drawers.ts` reads it back into a rule on demand. Storing the parsed form
   beside it would be a derived value in two places, which is the drift this file
   warns about everywhere else.

Other invariants:

- **A place filter means the whole subtree, and counts roll up.** Both were
  wrong until drawers made it obvious: filtering matched one exact place id, so
  scanning a *cabinet's* QR listed nothing (its folders live in its drawers),
  and `countByPlace` didn't roll up, so a cabinet holding forty folders printed
  **"0 folders"** onto its own label. `subtreeIds` and `rollUpCounts` in
  `lib/tree.ts`.
- **A misfile is only raised when a SIBLING drawer claims the folder.** Without
  that condition it nags about every folder whose drawer happens to carry a
  rule, including ones with no better home anywhere. Judged on `homePlaceId` —
  where the folder *belongs* — so a folder checked out to your desk reads as
  out, not misfiled. Moving it updates the record; the paper is still your job.
- **An overflow drawer ("Misc.", "Other", "General") claims nothing and is
  offered when nothing else does** — which is exactly what one is for. When
  there is no overflow drawer either, the suggestion is empty rather than a
  guess.
- **The A-Z quick-build weighs the busy initials.** Equal letter counts give one
  drawer that jams and one holding Q, X and Z; the weighting is why real
  cabinets read A-J / K-P / Q-Z. Approximate on purpose — any drawer's label can
  be retyped. `alphabetSplit` in `lib/drawers.ts`.
- **A cabinet's drawers are created as one batch** (`addCabinet`), not by
  repeated `addPlace` calls: `ref.current` only catches up on the next render,
  so five calls in a row hand every drawer the same `sortOrder` and the cabinet
  reads 1, 10, 2 down its front.

- **`nextDueOn` is derived and restamped on every write** (`withDerived` in
  `useFilingDocuments`), and on everything arriving from Firestore, so it can
  never disagree with the array it comes from. A stale cache is what makes the
  badge lie.
- **The badge honours each obligation's OWN lead time.** It can't load the
  obligation arrays, so `withDerived` also caches `remindFrom` (earliest
  `dueOn − leadDays` among obligations that set one) and `nextDueDefault`
  (earliest `dueOn` among those that don't, which follow the account default).
  Together they reproduce `isDue` exactly — with only `nextDueOn` and the
  account default, a passport nudges in the panel for six months while the badge
  stays silent for five of them. Both are derived, so they are deliberately NOT
  persisted to Firestore: a derived value in two places eventually drifts.
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
- **Attachments are optional and index-first.** A scan is a convenience for when
  you can't get to the paper; the record works without one. Pointers live in
  `filingDocs/{id}` and are loaded **per document, on open** — the only
  collection here not subscribed whole, because it's the only one that grows
  without bound. Objects go to R2 via `/api/filing/attachment/presign` +
  `/api/filing/object/delete`, with `lib/r2.ts` COPIED from inventory's (a
  feature never imports another feature) and its `isOwnedFilingPath` scoped to
  the `filing/` prefix so a bug there can't reach an inventory object.
  - PDFs and images only; **SVG and HTML are refused** because the public bucket
    is a different origin and both execute script there. The content-type is
    *signed*, so the PUT can't swap it afterwards.
  - A presigned PUT can't carry a size condition (S3 only supports that on POST
    policies), so the 20 MB cap is a **declared-size check**, and the per-user
    issuance throttle is what actually limits abuse.
  - The object key is composed server-side from the session subject, so a client
    can't target another user's prefix.
  - The whole surface **hides itself** when the R2 env vars are absent, rather
    than offering a button that can't work (`attachmentsEnabled()` probes the
    presign route once).
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
