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
There is **no `firestore.rules` file in this repo** — rules are managed in the **Firebase
console**. Any new collection must be covered by a console rule scoping docs to the owner's
`uid`. (When adding a feature that needs rules, write the proposed rule text for the user to
paste into the console; we cannot diff a file that doesn't exist here.)

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
  `/focus`, `/habits`, `/habits/guide`, `/inventory`, `/guide` (site guide),
  `/faq`, `/privacy`, `/terms`, `/login`.

## Styling

Tailwind v4 utility classes. Dark theme: `bg-gradient` over `slate-950/900`, text `slate-50`,
muted `slate-400/500`, accent `blue-500/400/300`, pill chrome `rounded-full border-slate-800
bg-slate-900`. Match these tokens — no inline styles, no foreign styling approach.

## Environment variables

Client (`NEXT_PUBLIC_*`, read in `src/lib/firebase.ts`):
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
Server (next-auth): `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
Secrets live only in the gitignored `.env.local`. `.env.example` is the annotated
full list (next-auth, Firebase, and the optional push/QStash/UPC-lookup/R2 sets).
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
caps without re-verifying firebase. uuid stays at v8 (next-auth@4 dependency); its advisory is
dismissed as not-affected (v4-random only, no `buf`).

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

## Git & PR workflow

- **Default: ship each fix via a PR and merge it.** For every change, open a pull
  request and merge it into `main` once verification passes (lint + typecheck +
  build + `npm run test`) — do this without asking. Only pause to ask first when
  there's urgency or risk that warrants a check (e.g. a large/irreversible change,
  ambiguous requirements, or a failing/blocked CI). Standing owner preference.

## Conventions

- File comments are sparse; match the surrounding density. `@/` is the `src/` alias.
- Follow existing patterns exactly; prefer the smallest diff to shared files.
