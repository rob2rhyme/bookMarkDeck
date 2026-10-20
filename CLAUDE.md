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
`src/features/{focus,habits,inventory,notes}/FIRESTORE_RULES.md`. Any new collection must stay under
`users/{uid}` (or get its own owner-scoped rule) — and that is **enforced**, not just asked for:
`src/lib/firestorePaths.test.ts` scans the source for `doc(db, …)` / `collection(db, …)` and fails
if any path is not rooted at `users` with a uid *variable*. A stray root collection would otherwise
pass lint, typecheck and build, and only fail at runtime — where the tempting fix is a top-level
allow in `firestore.rules`, which is the drift this section warns about.

The assertion count below is printed by the script and repeated in `firestore.rules`; the three
move together.

Firestore evaluates the **deployed** ruleset, so the repo copy and production used to be able to
drift silently. **`.github/workflows/firestore-rules.yml` closes that gap** — on any change to
the rules files it proves the ruleset against the emulator, deploys it on merge to `main`, and
then reads the released ruleset back to confirm the deploy landed:

| Command | Answers |
|---|---|
| `npm run verify:rules` | is the **file** correct? (55 assertions: owner access, cross-uid denial, anonymous denial, no leak outside `users/{uid}`; notes asserted in full) — needs `FIRESTORE_EMULATOR_HOST` |
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
- **That cache is shared by every open tab, so a hook that owns it adopts `storage`
  events** (`useBookmarks`, `useShortcuts`). They read once on mount and wrote their
  whole arrays after, so a stale tab — the moment you opened a bookmark in it, which
  bumps `hits` — put back its old copy and erased what another tab had added. With
  cloud sync manual, that cache is the only copy of anything not yet pushed. Adopted
  arrays are held in a ref so they aren't written straight back, and an event never
  wipes state. It is adoption, not a merge: two tabs writing in the same instant still
  end with the last write.
- **Bookmark import only appends** (`planBookmarkImport` + `importBookmarks`), as
  filing's does. It used to `clearAll()` and re-add everything through `addBookmark`:
  every bookmark got a new id and `createdAt`, lost its pin, icon and usage, and a
  pending delete was queued for every original id — so focus and filing links broke,
  and after a push another device kept its old ids beside the new ones, duplicating
  everything. An imported record keeps its own id unless that id is taken, so
  re-importing your own backup keeps those links. Undo restores the pre-import list.
- **The folder tree travels with every backup.** Restore used to put back only the
  bookmarks, which then pointed at folders that no longer existed — hidden from the
  grid *and* Unstaged until a reload — and "Download backup" left folders out of the
  file. `restoreBackup(bookmarks, folders)` restores both (a backup from before
  folders were stored keeps today's tree and unstages anything orphaned);
  `src/utils/bookmarkBackupFile.ts` owns the file format. Any imported tree merges
  through **`planFolderImport`**: by id, or by (parent, name) — never by name alone,
  so a nested "Clients" can't be pulled into an unrelated top-level one. A browser
  HTML file goes through **`planFolderPaths`** by the same rule: `parseBookmarkHtml`
  returns each link's full `folderPath` (the headings of the `<DL>`s it sits in —
  taking the first `<H3>` in each ancestor credited a list's direct links to its
  first subfolder) plus its `<DD>` note, `TAGS` and `ADD_DATE`, and import recreates
  the tree instead of dropping everything into Unstaged.
- **HTML export walks the real tree, by `folderId`** (`bookmarksToNetscapeHtml(bookmarks,
  folders)`): nested `<H3>`/`<DL>` blocks, current names, empty folders included. It
  used to group by the denormalised `bookmark.folder` name, which renames and
  auto-organize never update — renamed folders kept old names, nesting flattened,
  auto-organized links exported unfiled. That label is now read only for records with
  no usable `folderId`. `src/utils/bookmarkRoundTrip.dom.test.ts` pins export → import:
  every link comes back with its folder path, note, tags and date. Empty folders are
  written for the browser but not recreated on import (import makes only the folders
  its links need); the JSON backup carries the whole tree.
- **Day keys are LOCAL `YYYY-MM-DD`.** Never slice a UTC instant into one
  (`iso.slice(0, 10)`, `toISOString().slice(0, 10)`) or compare one with a local day;
  map the instant through a local-getter helper — **`@/lib/dayKey`** (`dayKeyFor`,
  `todayKey`, and `dayKeyOf`, which returns a bare `YYYY-MM-DD` as-is rather than
  letting `new Date()` read it as UTC midnight). It is the **only** formatter:
  habits' `lib/day.ts` re-exports `dayKeyFor`/`todayKey` beside its arithmetic, and
  `habitStartDay` maps a habit's creation instant through it. There were seventeen
  hand-rolled copies — all correct, which is the trap, because a copy is right only
  until it is edited — and **`src/lib/dayKeyFormatters.test.ts` now fails on any new
  one** (a `getMonth() + 1)`, a `.slice(0, 10)`, a `toDateString`). Its allowlist is
  short and every row says why. Most rows are UTC *label* arithmetic: a bare day parsed
  as UTC midnight, shifted in UTC, formatted back with `toISOString` (filing
  `obligations`/`ics`/`expiry`/`stats`, inventory `value.shiftYears`). That is
  self-consistent because no instant enters, and local getters there would land a day
  early west of UTC. The one other-format row is `@/lib/focusHydrationCache`'s
  legacy `toDateString` stamp (see **Focus feature** → Hydration), built from the
  day's parts and never parsed. **A test of day logic pins a zone** (`process.env.TZ`, restored
  after): CI runs in UTC, where a UTC date *is* the local date, so this whole class
  of bug passes every unpinned test. That is how a habit's first evening went
  missing and a young habit's 30-day rate read 13% for months. For the same reason
  a test should not *mock* the day: `useFocusTimer`'s test pinned it through
  focusData's own `todayKey`, a pin no test reached; it now reads the real one in
  `Pacific/Kiritimati`.
- **A record the cloud lacks is uploaded (or kept on a pull) only if the cloud never
  had it** — `src/utils/syncedIds.ts` remembers the ids the cloud held at each
  device's last sync. "Everything the cloud lacks" treated *deleted on another
  device* as *new here*, so a stale device kept resurrecting deletions. Focus's
  upsert-only queue (1e4dc90) was not reused: a never-synced account has an empty
  queue, so its first connect would upload nothing and lose everything. With
  `syncedIds` a never-synced device has an empty record and uploads all of it, as
  before. Deletes made while disconnected go through `pendingDeletes` and are
  replayed on connect. Upload still makes the cloud match the device, so a stale
  device should download first — the FAQ says so.
- **In the live-subscription pillars (filing, inventory), an edit made while
  disconnected is queued (`queueUpsert`) and pushed on connect** — `toUpload` in
  `syncedIds.ts` is `newHere` plus queued ids the cloud still holds. The seed used
  to upload only what the cloud never had, so an offline rename, check-out or
  re-parent was applied and then silently undone by the first snapshot. A delete
  made on another device wins over an offline edit (the queued id is dropped, not
  resurrected), and a **partial** filing paper is never pushed, so an offline edit
  to one is still replaced by the cloud copy — PR C's rule, unchanged. It is
  last-writer-wins per record: the push overwrites any newer edit to the same
  record made elsewhere meanwhile, exactly as focus's queue does.
- Cloud sync to/from Firestore is **explicit** (`syncToCloud*` / `syncFromCloud*`), not automatic.
- Components are presentational; hooks expose a stable public API.

## Routing & shell

- Route groups: **`(app)`** (authenticated app) and **`(auth)`** (`/login`).
- `src/app/(app)/layout.tsx` wraps pages in `<AppShell>` (`src/components/AppShell.tsx`) +
  `<GlobalClientUI>`. `AppShell` renders the header (logo + pillar nav pills + account
  menu), a mobile bottom nav (pillars + ⌘K search), and the footer
  (Guide / Privacy / Terms / FAQ). **Both navs omit the pillar you are on** — that is
  what keeps six pillars at six bottom-nav cells (the most 320px holds). Header pills
  are icon-only below `xl`: five labelled pills plus the account menu overflow the
  row under ~1280px.
- Existing pages: `/` (home), `/folders/[folderKey]`, `/folders/manage`, `/folders/unstaged`,
  `/focus`, `/habits`, `/habits/guide`, `/inventory`, `/filing`, `/notes`, `/notes/[id]`,
  `/guide` (site guide), `/faq`, `/privacy`, `/terms`, `/login`.

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
  **`src/lib/themeTokens.test.ts` enforces this** — it fails on a step the source uses but the map
  omits, on a token missing from `:root` or `.light`, and on a palette value nothing maps. It found
  one on the way in: `teal-700` (`LetThemCard`) was declared nowhere. That one was harmless by
  luck — an undeclared step stays put, which is what a saturated ground under white text wants
  anyway — but it was right by accident rather than by declaration, so it is now declared *held*
  beside `teal-500`/`teal-600`, at Tailwind's own value, changing nothing that renders.
- **Setting.** `theme: "system" | "light" | "dark"` on `AppearanceSettings`
  (`src/lib/appearanceSettings.tsx`), chosen in the account-menu Appearance panel, applied by
  `AppearanceApplier`, device-local like fonts and cursors. A blocking inline script in
  `layout.tsx` sets the class before first paint (no flash); it duplicates the storage key by
  necessity — a string in the HTML head cannot import — so keep the two in sync.
  `src/lib/storageKeys.test.ts` now enforces that: bump one copy and it fails naming the key.
  Bumping only one would bring back exactly the flash the script exists to prevent.
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
- `npm run test` → `vitest run` (`npm run test:watch` for watch mode). Two Vitest
  **projects**, split by filename — the convention is in `vitest.config.mts`:
  - **node** (`*.test.ts[x]`) — the bulk: pure-logic units over `src/utils`, `src/lib`, and the
    `focus`/`habits`/`filing` feature `lib/` helpers (streaks, formatting, exports, mood, etc.).
  - **dom** (`*.dom.test.ts[x]`) — jsdom + `@testing-library/react`, for hooks and DOM logic
    that pure functions can't reach. `vitest.setup.dom.ts` unmounts between tests.
    **A hook whose bug would survive a pure-logic test belongs here** — e.g.
    `useFocusTimer.dom.test.tsx` covers the restore-from-localStorage paths, which depend on
    effect *ordering* and so are invisible to any unit test of the maths.
  - Six **source-scanning** tests sit in that node project and assert properties of how
    the code is written rather than what it returns, so nothing else could catch them:
    `src/lib/firestorePaths.test.ts` (every Firestore path starts `users/{uid}`),
    `src/lib/featureBoundaries.test.ts` (a feature never imports another feature — see the
    two sections below, and `MYSTUFF-DECOUPLING-READINESS.md` for the declared exceptions),
    `src/lib/copiedModules.test.ts` (the deliberately duplicated `r2.ts` pair keeps the
    same exports — `push.ts` was the second pair until it moved to `@/lib/push`),
    `src/lib/themeTokens.test.ts` (the theme map covers every palette
    step the code uses — see **Theme** below), `src/lib/storageKeys.test.ts` (the
    localStorage keys that are hardcoded in more than one file stay in agreement), and
    `src/lib/dayKeyFormatters.test.ts` (no day key is formatted outside `@/lib/dayKey` —
    see **Day keys are LOCAL** above).
- **The session gate is `middleware.ts`, and route-handler tests cannot see it** — they call
  the handler directly. That blind spot let background push and billing ship dead: the
  matcher sent QStash's and Lemon Squeezy's cookieless webhook POSTs to `/login` with a 307
  before their signature checks ran, while 51 passing `push/*` route tests said nothing.
  The matcher now names its exemptions explicitly (the two webhooks and the PWA files),
  and `e2e/machine.spec.ts` asserts each is answered by its route **and** that neighbouring
  routes stay gated. **Exempting a route makes its own gate the only gate**, so any route
  added to that list needs a route test proving its check rejects a forged request.
- `npm run e2e` → `playwright test` (`e2e/`, Chromium). Its own **blocking** CI job.
  Covers the public surface *and* all six authed pillars — signing in needs no real
  credentials, because the gate is `getServerSession`, which only verifies a
  next-auth JWT against `NEXTAUTH_SECRET`; `e2e/fixtures/session.ts` mints a cookie
  with the same dummy secret the test server runs with. Firebase creds gate only
  live Firestore sync, so the pillars render their empty state.
  Two settings exist because it blocks merges: `retries: 2` on CI (which is also
  what makes `trace: "on-first-retry"` fire at all — before, retries defaulted to
  0, so the trace could never be captured), and `forbidOnly`, since a stray
  `test.only` would otherwise shrink the suite to one test and still exit 0.
  On failure the HTML report uploads as a `playwright-report` artifact.
- "Verify" = lint + typecheck + build + `npm run test`, plus a **manual smoke check**:
  login, bookmark sync, Drive sync.
- CI: `.github/workflows/ci.yml` runs `actionlint` (workflows) + `typecheck` + `lint:eslint`
  + `test` + `build` (root) on PRs/pushes to `main`, with dummy env vars. Vercel builds
  previews. **`lint:eslint` is blocking** — it was `continue-on-error` while an error
  backlog was cleared. It carries real weight, because `npm run lint` is only
  `tsc --noEmit`: ESLint is the sole check that catches a lint-level regression. The 85
  remaining *warnings* are **all one rule** — `react-hooks/set-state-in-effect`; only
  errors fail the build. That the set is homogeneous is the useful part: a warning from
  any other rule is new, and worth reading rather than assuming it is backlog.
  **They are not all the hydration pattern**, which this line used to claim. Classified
  by the shape of the effect each sits in (2026-09-16):

  | Shape | Count |
  |---|---|
  | cloud subscribe / fetch (`[canSync, email]`, `[connected, email]`) | 28 |
  | mount-only — the hydration read below, plus one-shots like `setMounted(true)` | 15 |
  | modal / panel reset on open (`[open, …]`) | 14 |
  | other storage-backed reload (+1: `useNotes`' cache load, `[email]`) | 15 |
  | **derived-state reset** | **13** |

  Hydration-shaped effects are about **30 of 85**; the biggest group is Firestore
  subscriptions, which have nothing to do with hydration. The distinction earns its
  place because the blanket version of it is how #292's regression stayed in `main` for
  months — a deleted button whose orphaned state warned for exactly this rule, waved off
  as expected backlog.
  **If the count ever moves, read the derived-state 13 first**: they are the ones React
  advises deriving during render (or resetting via `key`) instead of writing from an
  effect. All 13 were inspected on the date above and are sound — each uses a functional
  updater or an early-return guard, so none can loop or fight user input — but that is a
  finding with an expiry, not a permanent property.
  **The count has moved once, and back, without a fix either way**: `useHydration`'s
  per-account cache load (an "other storage-backed reload", deps `[email]`) went quiet
  (84 → 83) when its day began flowing through `dayRef.current` — the rule exempts state
  set from a ref read — and warned again once the read moved into a `loadDay` callback
  beside `setHydrated`. The same load throughout. A drop is as worth explaining as a
  rise: the rule can go quiet without the code improving.
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
patched `sharp` and `postcss`, so it holds the fix for those two. When an advisory lands inside
a range the tree already allows (`next` asks for `sharp ^0.35.4`), `npm update <pkg>` is the
whole fix — a lockfile change, no override.

**`npm audit` is not 0, and the residual is known: `braces` (GHSA-vfj7-8cjw-p6xm, high).** It
covers every release (`<=3.0.3`, the latest, from 2024), so there is no version to move to.
One path only, dev-only: `eslint-config-next` → `@next/eslint-plugin-next` (pins
`fast-glob 3.3.1`, unchanged through 16.3.8) → `micromatch` → `braces`. The DoS needs a
deeply nested glob *pattern*; the only patterns it sees are the plugin's own, at lint time,
over this repo — nothing user-supplied, nothing shipped. The 5 "high" lines `npm audit`
prints are that one advisory counted once per package on the chain. Re-check when `braces`
publishes a fix (`npm update braces` then clears it) or the plugin drops `fast-glob`; any
*other* audit line is new and real.

`@capacitor/cli` is pinned with a **tilde** (`~8.4.3`), not a caret, and that is
load-bearing: 8.5+ adds `xcode`, which pulls `uuid@7` (GHSA-w5hq-g745-h8pq, moderate).
Dependabot proposed `^8.4.3`; npm resolves that to **8.5.1**, and audit goes from 0 to 3
moderate. A dependabot `ignore` stops 8.5.x being *proposed* but cannot stop a caret from
*resolving* there — so the range has to hold the line, and regenerating the lockfile is
safe rather than something to avoid. macOS-only iOS tooling, never built on CI or Vercel.

**The rest of Capacitor moved to 8 without it** (#307: `core`/`ios` 6.2.1 → 8.5.2), so
the set is deliberately *not* on one version: `cli` 8.4.3 beside `core` 8.5.2. Same
major, no peer edge between them, `npm ci` clean, audit 0. Do not "tidy" that by lifting
the tilde.

**`@capacitor/local-notifications` was bumped in #307 and then removed as unused.** It
had been a dependency since the shell landed (`a14b40b`, which added all four Capacitor
packages as a set) and was never once imported — the time-sensitive timer alert is the
hand-written Swift `TimerAlert` plugin in `CAPACITOR_IOS.md`. It may well come back: 8.1.0
added `interruptionLevel: 'timeSensitive'`, which is the *only* reason that custom plugin
exists, so building the iOS shell should start by trying the official plugin. Re-adding is
one `npm i`; that note lives in `CAPACITOR_IOS.md` §2 where it will actually be read.

### Dependabot: what is held back, and until when

`.github/dependabot.yml` ignores **three** packages at **specific versions**. Each is blocked
on a fix outside this repo; without the ignores they regenerate weekly (#255 was closed and
#268 reappeared with the same content inside the hour).

**An ignore can acquire a cost it did not start with.** The `vitest` entry was created for an
install-time npm crash. It later turned out that the only non-vulnerable release in the 4.x
line (4.1.11, for GHSA-82fw-gwwq-j7x9) was one of the two versions it silenced — so a
convenience hold had quietly become a security hold, and `npm audit` was the only thing
saying so. Resolved by moving to vitest 5 rather than by loosening the ignore. When one of
the rows below is long-lived, re-check what it is costing, not just whether its stated
blocker still holds.

| Package | Ignored | Blocker | Unblocks when |
|---|---|---|---|
| `@capacitor/cli` | `8.5.x` | `xcode` → `uuid@7` | `xcode` drops `uuid@7` — **and nothing else**: the 6→8 migration landed in #307 without it |
| ~~`vitest`~~ | — | *resolved:* moved to **vitest 5** | — |
| `typescript` | `7.0.x` | `typescript-eslint` does not support TS 7.0 | TS ≥7.1 (typescript-eslint#10940) |
| `eslint` | `10.x` | `eslint-plugin-react` uses the context API ESLint 10 removed | `eslint-config-next` supports ESLint 10 |

Two rules govern that file, both worth keeping:

- **Ignores name versions, never bare packages.** A bare `dependency-name` silences the
  release that *fixes* the problem along with the problem — which is how a repo ends up
  years behind on something nobody meant to freeze. This binds our own entries too: the
  `jsdom` `30.x` ignore was **removed** the moment CI moved to Node 22, because its stated
  cause was gone. An ignore that outlives its reason is a bug.
- **The `capacitor` group needs `exclude-patterns` on the catch-all groups, or it never
  fires.** The Capacitor packages are peer-bound — `@capacitor/ios` requires a matching
  `@capacitor/core` — so bumping one alone fails `npm ci` with `ERESOLVE`; one PR moving
  them together is the only shape that resolves, and majors are included because 6 → 8 is
  the move that needs making. **This line used to say the group was listed first on
  purpose, because "a dependency joins the first group it matches". That is not how
  Dependabot assigns groups, and the group had never once fired.** It runs a *specificity*
  pass; map order is irrelevant. From the updater log of 2026-09-17 (job `105213613712`):

  ```
  INFO Skipping @capacitor/core for group 'capacitor'
       - belongs to more specific group 'production-minor-patch'
  WARN Skipping update group for 'capacitor' as it does not match any allowed dependencies.
  INFO Adding dependencies as handled: ().
  ```

  `dependency-type` + `update-types` outranks `patterns`, so all four `@capacitor/*`
  packages were reassigned to the catch-all groups — which then dropped them again, a
  6 → 8 bump being a major and those groups taking only minor and patch. Matching no group
  at all, they fell through to the individual updater. That is what the nine PRs closed
  unmergeable for this one cause actually were (#147/#148/#149, #273/#275/#277, #304/#305,
  plus the `local-notifications` single): not a problem grouping fixed, but one it was
  silently failing to. `exclude-patterns: ["@capacitor/*"]` on both catch-alls leaves the
  specificity pass nothing to prefer — `DependencyGroup#contains?` returns false on an
  excluded name before any other rule is read.

  **The YAML is not the proof.** A group that matches nothing fails by going quiet, so the
  only check that means anything is the next updater log: the "more specific group" lines
  gone, and one grouped PR instead of singles.
- **Dependabot rebases a grouped PR between your verification and your merge, so verify
  the MERGED diff, not the branch.** #303 was checked out, installed and gated locally at
  `@anthropic-ai/sdk` 0.125.0; by the time it merged, Dependabot had rebased it onto a
  newer `main` and what landed was **0.127.0**. The squash commit's message on `main` still
  says 0.125.0 and is wrong about it. Coverage happened to survive — the next PR sat on that
  same `main`, so its gate exercised 0.127.0 — but that was luck, not method. `git show
  <merge-sha> -- package.json` after the fact is the cheap check; `expectedHeadSha` on the
  merge call is the cheaper one, because it refuses the merge instead of silently changing
  what you shipped.
- **A closed Dependabot PR whose branch survives suppresses its own replacement.** #275 was
  closed on 2026-09-06, but its branch is still on the remote, and the 17 Sep run logged
  `Pull request #275 already exists for @capacitor/local-notifications` and skipped the
  package entirely. The stray-branch backlog is not cosmetic — it silently shrinks what
  Dependabot will propose. `@dependabot recreate` forces the issue on a single PR; deleting
  the branch is the actual fix.

`typescript` deserves one extra note: `npm run lint` is `tsc --noEmit`, and it **passes**
under TS 7.0 — only the separate `lint:eslint` pass fails. That pass is now **blocking**,
so a TS 7 bump fails CI loudly instead of merging green while silently breaking linting.
The ignore stays until `typescript-eslint` supports TS 7; what changed is that removing it
prematurely is no longer a silent mistake.

## Focus feature (`/focus`)

A self-contained "focused-work hub" (see `FOCUS-INTEGRATION.md`), under
`src/features/focus/` + the `/focus` route. It **imports no other feature** — but it is
not removable cleanly, because **habits imports it** (3 files, 4 import statements:
`useFocusSessions`, `FocusCorrelationCard`, `trackableSources`), so
`rm -rf src/features/focus` breaks the habits build. Those edges are deliberate — habits
correlating with focus sessions is a product feature — and are declared and enforced in
`src/lib/featureBoundaries.test.ts`, with the reasoning in
`MYSTUFF-DECOUPLING-READINESS.md` §C4. Removability has two directions and this line used
to conflate them; filing (below) is the one that is clean in both.

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
  **The cache is shared with habits** (a linked water habit reads and mirrors it)
  **through `@/lib/focusHydrationCache`**, which owns the key, the shape and the
  day rules. It was two hand-written copies, and they drifted: habits ignored the
  day it was given, so a habits tab still on yesterday just after midnight wrote
  yesterday's count into Focus's cache as today's. Records are keyed by a local
  `YYYY-MM-DD`; the old `toDateString` stamp is still matched (a pre-upgrade
  count survives) **and still written beside it** — a tab on the previous bundle
  compares that stamp, and without it would read "no record today" and zero the
  count. Keep the dual write until no pre-upgrade tab can be alive. Only today's
  count is cached (a write for another day is dropped).
  **Focus's day rolls over on its own clock** (a 15 s check plus focus/visibility,
  and at the start of every action but the explicit Upload, which writes the count
  on screen to the day it belongs to) — it used to live inside the reminder loop, so
  with reminders off a tab left open overnight carried yesterday's count into today.
  **A rollover writes nothing remote** (it wrote 0 to the new day's record, over
  cups a phone had logged while the laptop slept), and **the live record follows
  the current day** (it stayed on the day the hook mounted).
  **Nothing is written to a day's record before the server's first answer is
  read** — at mount, on (re)connect and after a rollover. That answer merges:
  `max(this device's base, the cloud's count) + what this device added or removed
  since`, so a cup taken in the gap is kept rather than swallowed by the max, and
  can't overwrite a higher count from another device. Upload and Download reset
  the base (an uploaded or adopted count is not a local change, and counting it
  again doubled it). **Cache-only answers don't count**
  (`subscribeHydration(…, { serverFirst: true })`): offline, Firestore answers at
  once from the device's cache, where a record another device wrote reads as
  *missing* — merging against that queued a write that replaced the other device's
  count on reconnect. Reproduced against the real SDK and the emulator; the
  in-memory fake in `useHydration.dom.test.tsx` can't show it, so
  `focusData.test.ts` pins the rule on `onSnapshot` itself. **A day that ends before
  its record was ever read** (offline across midnight) sends what this device
  owes it as `addHydration` — a Firestore `increment`, which composes with other
  devices' writes instead of replacing them.
  **Known limits — older than all of this, verified on `a4d8908`, not fixed:** every
  other write is an *absolute* count, so once a listener is attached the last
  writer wins. A laptop that loses its network on the same day keeps its listener
  (nothing re-subscribes), and a drink there replaces the phone's newer count on
  reconnect. Habits' water taps write the same way, before any server answer
  (only habits' *subscription* is server-first). Opening Focus with a stale device
  cache can undo a removal made elsewhere (the max keeps the stale higher count),
  and two tabs on one device each merge only their own changes. The structural
  fix is to write every drink as an increment, as the rollover already does; it
  changes both pillars' write model, so it is an owner decision.
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
  cached **slim** — only the fields the list, search, badge and queues need —
  **and only once the cloud copy has loaded.** Slim is safe only while a fuller
  copy exists elsewhere: it used to be unconditional, so an unsynced account lost
  every obligation, note and reference on each reload, and a synced one editing
  before the first snapshot wrote the stripped record over the full cloud copy
  (`setDoc`, no merge). Before that point documents cache whole.
  `subscribeDocuments(folderId?)` exists so per-folder lazy loading is a one-line
  change past a documented threshold.
- **A record rebuilt from the slim cache is `partial`, and a partial record is
  never written to Firestore.** Its missing fields are *missing*, not empty.
  `saveDocument` takes a `CompleteDocument` and also throws at runtime on one.
  The marker clears only when the cloud copy replaces the record, or when the
  connect-time seed finds the cloud holds no copy at all (then the local one is
  the fullest that exists). While syncing, edits to a partial record wait for the
  snapshot, and the sync banner says so. Unsynced, they apply and the marker
  stays, so the record is cached whole without ever becoming eligible to
  overwrite a cloud copy. An edit sends only the form fields the user changed
  (`changedFields`), so a form seeded before the snapshot can't write its blanks
  back.

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
- **Push uses the SHARED `@/lib/push`** — it was two per-feature copies until the
  `/api/push/*` routes' own client was recognised as the shared infrastructure
  those routes already are. **Choosing duplication means owning the drift**, and
  for a while nothing did: filing's copy grew `pushSupported()` and focus's never
  got it, so habits — which imported focus's copy — offered "Turn on reminders"
  on a deployment with no VAPID key. The prompt was raised and granted; the
  reminder could never fire.
  The copies bought nothing to offset that: they were code-identical but for one
  default string. **`r2.ts` is the opposite case and stays copied** — baking the
  prefix into `isOwnedFilingPath` makes it structurally incapable of authorising
  an inventory object, where a shared `isOwnedPath(path, seg, prefix)` would
  downgrade that to a runtime argument. `src/lib/copiedModules.test.ts` still
  asserts that pair exports the same names (pillar token normalised, so
  `isOwnedFilingPath` vs `isOwnedInventoryPath` reads as a match).
  **A copy has to buy a property you can name.** `schedulePush` therefore takes a
  **required** `url`: the per-pillar copies each defaulted it to their own route,
  and a shared default would silently send one pillar's notification to another's
  page.
  **And a required `tag`, for the same reason.** A notification replaces any other
  showing with its tag, and until push actually arrived (#316) nobody could see
  that every one shared `bmd-focus-timer`: two habits due at 07:00 showed as one,
  and the next timer end erased an unread digest. Tags: `bmd-focus-timer`,
  `focus-streak`, `filing-digest`, `habit:{id}`; `/api/push/schedule` falls back
  to the timer's for anything else. The worker's badge is `icons/badge-96.png`,
  white on transparent — Android draws a badge from alpha alone, and the opaque
  app icon rendered as a solid square. `src/lib/serviceWorker.test.ts` loads the
  real `public/sw.js` into a `vm` sandbox, since nothing imports it. It also pins
  the static cache: **bounded at 250 entries**, oldest first, never the offline
  page. The name sat at `v14` for 223 commits while every deploy's hashed chunks
  piled up under it. The harness's `waitUntil` throws after dispatch, stricter
  than a browser on purpose: a revalidation registered from inside the network
  `.then` threw on a real `FetchEvent` and answered a cache miss with nothing.
  **Permission is asked only from a click** — `requestPushPermission()`, called by
  a click handler; `schedulePush` never prompts. It used to, whenever permission
  was `default`, and the filing digest's effect reached it on every `/filing`
  visit once `pushEnabled` synced from another device: Firefox and Safari refused
  silently while settings said "on", and Chrome re-prompted until it could
  auto-block the origin — taking Focus's and Habits' deliberate prompts with it.
  A `schedulePush` made in the same click as the request waits for its answer, so
  Focus's start button still alerts its first block. `usePushPermission()` is the
  per-device state (`useSyncExternalStore`, so no effect-set warning); the digest
  gates on it, and the filing settings say so when the synced setting is on but
  this device hasn't granted.
- **The `.ics` is a file to import, not a feed to subscribe to.** A live feed
  means a publicly-fetchable URL carrying someone's paperwork; deliberately not
  built. All-day `VALUE=DATE` events, so no timezone or DST question arises.
- **The bookmark↔document link is the pillar's stated condition** — a paper
  points at the bookmark for its account, so the policy in Drawer 2 and the
  insurer's login page are one record. `lib/bookmarks.ts` READS the core
  bookmarks localStorage cache (`bookmarkdeck:v2:{email}`) rather than mounting
  `useBookmarks`: a one-way read-only dependency on core, not a second
  subscription to the same data. Keep the key in sync with
  `storageKeyV2ForUser` — and note it is **four** files, not two: `useBookmarks`
  owns it, and filing's `lib/bookmarks.ts`, inventory's `useBookmarkLibrary` and
  `CommandPalette` all hardcode it to read the same cache.
  `src/lib/storageKeys.test.ts` pins that set, along with the nine other keys
  hardcoded in more than one file — bump one copy and the reader silently reads
  nothing, which no other check can see.
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

## Notes feature (`/notes`)

*Jot it down, find it later, copy it out in one tap.* A self-contained pillar under
`src/features/notes/` + `/notes` (list) and `/notes/[id]` (editor). Imports no other
feature; nothing imports it — removable cleanly in both directions.

- **Phases.** 1: list, editor, smart lists, clipboard. **2: search + tags** (this
  section). Markdown rendering and encryption are later phases — not built.
- Collection: `users/{uid}/notes/{noteId}` → `{ title, body, pinned, tags[], createdAt,
  updatedAt }`. Covered by the recursive owner rule; `FIRESTORE_RULES.md` says why a
  notes-specific rule would add nothing (rules OR together). Timestamps are the
  client's instant, not `serverTimestamp()` — a pending server time reads `null` in the
  local snapshot and would sink the note being typed to the bottom of the list.
- **Same sync model as filing**: per-user cache (`bookmarkdeck:notes:v1:{email}`) renders
  at once, the live subscription takes over when connected, offline changes go through
  `queueUpsert`/`queueDelete` and `toUpload` on connect. The cache is written
  **synchronously** by every change (not from an effect) because the editor saves on
  `pagehide` and unmount, which don't wait for a render. The hook adopts `storage`
  events (other tabs) **and** a same-tab `bd:notes-cache-changed` event — the list and
  editor are separate routes with separate hook instances, and an Undo or a blank-note
  discard lands after one has unmounted.
- **Order:** pinned first, then `updatedAt` desc. Pinning or tagging does **not** bump
  `updatedAt` — organising a note isn't editing it. Tags save at once, not through the
  autosave debounce.
- **Tags are canonical on write** (`lib/tags.ts`, `normalizeTag`): lowercase, no `#`,
  whitespace → `-`, only letters/digits/`-`/`_`/`/`, ≤32 chars, ≤20 per note. One form
  everywhere means the filter, `#tag` search and counts never re-fold at read time;
  `normalizeNote` re-canonicalises what it reads, so a hand-edited doc can't split a tag.
  Rename/delete across every note is `retag(from, to | null)`; delete offers Undo by
  restoring each note's previous tags.
- **Search** (`lib/search.ts`) is pure and client-side over the already-loaded notes —
  no index, nothing stored. Every word must match (title, body or a tag); `"quoted
  phrases"` are one term; `#tag` filters. Case- **and accent**-insensitive: matching
  runs on a folded copy that maps each folded unit back to its original index, so
  highlights land correctly even where folding changes length (`İ`). Ranked title >
  tag > body, ties keeping display order. A card shows the body line that matched
  (windowed), not its first line. Highlights reuse the shared `<mark>` styling but not
  `@/components/HighlightedText`, which takes one literal phrase. The query and tag
  live in the URL (`?q=`, `?tag=`, via `history.replaceState`) so Back from a note
  restores the results.
- **Editor:** autosave is debounced 800 ms and **driven imperatively** (`schedule()` from
  change handlers), so adopting a remote change never triggers a save of its own. It
  flushes on ⌘S, `pagehide`/hidden, and unmount. A remote change is adopted only while
  nothing is pending locally; otherwise last writer wins, per note. A note left
  **blank** is discarded when the editor closes — deferred a tick and cancelled by a
  remount of the same id, so React's dev double-mount can't delete the note being opened.
  Delete asks inline, then offers Undo.
- **Smart text is plain text** (`lib/smartText.ts`): Enter continues `- `/`* `/`• `/`1. `/
  `1) `/`[ ] ` items (numbers renumber the items below; a new checkbox is unticked),
  Enter on an empty item ends the list (outdenting first if nested), Tab/Shift-Tab
  indent — captured **only** on list lines or multi-line selections, so Tab still moves
  focus elsewhere — and ⌘/Ctrl+Enter toggles a checkbox. Edits are applied through
  `execCommand("insertText")` so they stay on the native undo stack (setting `value`
  wipes it); `e2e/authed.spec.ts` pins ⌘Z in a real browser.
- **Clipboard** (`lib/clipboard.ts`): `@capacitor/clipboard` when
  `Capacitor.isNativePlatform()`, falling back to `navigator.clipboard` on **any**
  native failure — the shell loads the live site, so a deploy reaches devices before a
  rebuilt app carries the plugin (see `CAPACITOR_IOS.md` §1).
- **The title is the one input above 16px.** `globals.css` forces every form control to
  16px with `!important` (iOS zoom-on-focus); an important base-layer rule outranks
  any utility, so the title's size is a `.bd-note-title` rule beside it.
- Keys: `N` new note, `/` search, Esc clears search or leaves the editor. An input that
  handles Esc itself `preventDefault`s it, and the editor's window handler skips a
  prevented Esc — that is how the tag box clears without closing the note.
- Size cap: `MAX_NOTE_CHARS` (300k UTF-16 units ≤ 900 KB UTF-8) keeps a note inside
  Firestore's 1 MiB document limit.
- Shared-file touches (additive): `AppShell.tsx` (nav entry; both navs omit the active
  pillar), `icons.tsx` (`StickyNote`, `Copy`, `ClipboardPaste`, `Pin`), `globals.css`
  (`.bd-note-title`).

## Git & PR workflow

- **Default: ship each fix via a PR and merge it.** For every change, open a pull
  request and merge it into `main` once verification passes (lint + typecheck +
  build + `npm run test`) — do this without asking. Only pause to ask first when
  there's urgency or risk that warrants a check (e.g. a large/irreversible change,
  ambiguous requirements, or a failing/blocked CI). Standing owner preference.

## Conventions

- File comments are sparse; match the surrounding density. `@/` is the `src/` alias.
- Follow existing patterns exactly; prefer the smallest diff to shared files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
