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
- Deployed on **Vercel**. CSP + security headers set in `next.config.ts`. **The CSP names its
  script hosts** (`SCRIPT_HOSTS`: Google Identity Services, Firebase's gapi, jsDelivr for
  Tesseract) instead of `https:`; a new external script needs its host added there, and
  `e2e/csp.spec.ts` fails on any violation the pages raise. `worker-src 'self' blob:` is
  load-bearing: Tesseract starts its OCR worker from a `blob:` URL, and while workers fell
  back to `script-src` (no `blob:`) on-device label/receipt reading was silently refused.
  **Stored links are untrusted**: a bookmark or shortcut can arrive from a shared file
  or the cloud, so `isUnsafeUrl` (`@/utils/normalizeUrl`) keeps `javascript:`/`data:`/
  `vbscript:` out of import and out of every `window.open`. `normalizeUrl` is for what
  the user types and is stricter (it would reject an `obsidian://` shortcut).
- Also in the repo (do **not** disturb when doing web work):
  - `src/utils/googleDriveSync.ts` — a **Google Drive sync** path.

## Auth — dual-layer (important)

Two independent auth systems, by design:

1. **next-auth (Google)** — owns the Next.js *session*.
   - Server: `const session = await getServerSession(authConfig)` from `@/auth/auth.config`;
     redirect to `/login` if absent (see `src/app/(app)/page.tsx`).
   - Client: `const { data: session } = useSession()` (next-auth/react).
   - Config: `src/auth/auth.config.ts` (Google: `openid email profile` plus Google Tasks and Calendar
     (`tasks`, `calendar.events`, `calendar.readonly`), with offline access).
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

**Sign-in is limited to the owner** (`src/auth/allowlist.ts`; `AUTH_ALLOWED_EMAILS`,
comma-separated, replaces the in-code default). Three checks, because each alone has a gap:
the `signIn` callback refuses other accounts (and unverified emails); the `jwt` callback
throws for them, which makes next-auth clear the cookie, so a session minted before the
lock reads as signed out; and `middleware.ts` checks the email itself, since the gate
decodes the cookie without running callbacks. `e2e/allowlist.spec.ts` pins all three
from the outside. **Sessions last 14 idle days** (`session.maxAge`; next-auth's default is
30): the cookie carries the Google refresh token, and the expiry slides with every visit.
Google access is **not** revoked on sign-out on purpose — revoking the refresh token revokes
the whole grant, which would cut Tasks/Calendar on every other signed-in device too.
The default lives in code so an unset variable locks to the owner
rather than failing open. **Firestore is locked the same way** (see **Firestore security
rules**): before, anyone could sign into Firebase with the public web config and keep data
under their *own* `users/{uid}` at the owner's cost. The Firebase project
(`unified-project-440e5`) is single-owner by this rule — another app sharing it gets the
same lock.

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
`match /users/{uid}/{document=**}` allowing read/write only when `request.auth.uid == uid`
**and** the token's email is the owner's, verified (`isOwner`; `allowedEmails()` repeats
`DEFAULT_ALLOWED_EMAILS` from `src/auth/allowlist.ts`, and `allowlist.test.ts` fails if the
two differ — rules can't read env, so `AUTH_ALLOWED_EMAILS` doesn't reach them) —
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
| `npm run verify:rules` | is the **file** correct? (66 assertions: owner access, cross-uid denial, anonymous denial, other accounts and unverified/missing emails denied even their own tree, no leak outside `users/{uid}`; notes and notes vaults asserted in full) — needs `FIRESTORE_EMULATOR_HOST` |
| `npm run verify:rules:emulated` | the same, booting the emulator itself (needs Java) — what CI runs |
| `npm run deploy:rules` | push the repo copy to production |
| `npm run check:rules` | is **production** running the repo copy? |
| `npm run check:sa <key.json>` | is this file a usable service-account key? (never echoes its contents) |

The deploy half needs the repo secret `FIREBASE_SERVICE_ACCOUNT` — a JSON key for a service
account holding **both** `roles/firebaserules.admin` (create rulesets, move the release) and
`roles/serviceusage.serviceUsageConsumer` (what firebase-tools needs to call project APIs as a
service account rather than a user). Service accounts live in the Cloud console, not the Firebase
one: console.cloud.google.com → IAM & Admin → Service Accounts, same project as `.firebaserc`.
Full steps are in the workflow header. **The deploy job runs only on `main`**: the workflow is also
dispatchable, and a dispatch on another branch would run that branch's own verify script — so
without the ref check an unmerged branch could ship an open ruleset. For a second gate, add a
GitHub `environment` with required reviewers holding the secret (repo settings, not YAML).
Without the secret the deploy job skips with a notice
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
- **Other services' exports go through the same import.** `handleImport` reads a `.csv` with
  `parseServiceCsv` (`@/utils/parseServiceCsv`, over the RFC 4180 `parseCsv`) and everything
  else with `parseBookmarkHtml`, so Raindrop and Pocket files share the preview,
  de-duplication, `planFolderPaths` and Undo of a browser file — no second import path.
  Columns are found by NAME, case-insensitively; only `url` is required. Raindrop
  (`excerpt`/`favorite` columns): collection → folder (its catch-all "Unsorted" stays
  unfiled), comma tags, `created`, **favourite → pinned** (`ParsedBookmark.pinned`, kept by
  `planHtmlImport`). Pocket (`time_added` + `status`): `|`-separated tags, unix dates, and
  two lists become a "Pocket" folder with a "Read archive" subfolder (the HTML export,
  `<h1>Unread</h1><ul>…`, is mapped the same way). Raindrop's `excerpt`, `cover` and
  `highlights` are not imported — an excerpt is a page summary, not the reader's own note.
  A row without a link is skipped and unsafe schemes are still dropped by
  `planBookmarkImport`. `e2e/import.spec.ts`.
- **A link added without a title takes the page's own** (`nameFromPage` in `useBookmarks`,
  `@/utils/linkTitle` → `GET /api/link-title` → `@/lib/fetchPageTitle`). Add Link saves at
  once under the URL, then sets the fetched title only while the bookmark still reads as
  its URL, so a name typed meanwhile wins. The server fetch is the SSRF surface, so it is
  fenced: http(s) on default ports, no credentials, every resolved address checked **at
  connect time** (a `lookup` hook — a separate check would pass DNS rebinding) and every
  redirect re-checked (≤3), against `isPublicAddress` (`@/lib/pageTitle`: no loopback,
  private, link-local/metadata, CGNAT, multicast, or those behind IPv4-mapped/NAT64
  forms); 5 s for the chain, 256 KB read, HTML only; session-gated, 30/min. A failure is
  `{ title: null }`, never an error. `fetchPageTitle.test.ts` runs it against a real local
  server. Description and favicon are not fetched (favicons come from the URL).
- **An empty library offers starter links** (`StarterPicker` + `@/utils/starterLinks`),
  from a link in the empty state — never opened on its own, since a returning user on a
  new device should *Sync from cloud* first. Picks are filed into a top-level folder per
  kind (an existing one of that name is reused) and links already saved are skipped. Focus
  does the same for a task list that has never held a task (`starterTasks.ts`).
- **Milestones are derived and celebrated once** (`@/lib/milestones` ladders →
  `MilestoneRow`; `useMilestoneCelebration`). The badge row is computed from counts a page
  already holds (Focus sessions/streak/minutes, the best habit streak, items, bookmarks,
  notes, papers) and stored nowhere. The "New milestone" card is the only state: a
  per-device, per-account set of seen rung ids (`bd:milestones:seen:v1:{email}`), written
  as every rung **at or below** what was reached (a streak that breaks and climbs again
  must not re-celebrate its 3-day rung). The **first look at an account celebrates
  nothing** and just records what's earned — otherwise a long-time user gets a card per
  milestone ever crossed. A page passes `ready` (its numbers have loaded) and the hook
  then waits `SETTLE_MS` of **unchanged** metrics before judging, because a count passes
  through smaller values on its way from cache to cloud; judging early records too
  little (old milestones celebrate later) or celebrates a list loading. A card counts as
  seen once shown, so a reload doesn't repeat it. No account, no celebration.
- **Reader view and highlights** (`ReaderModal`, opened by a *Read* button on every
  `BookmarkCard`, so the home, folder and Unstaged pages all get it). `GET /api/reader` fetches
  the page through the same fenced fetcher as titles (`@/lib/fetchPage` `fetchHtml`, now
  shared: 1.5 MB, 8 s) and `extractArticle` (`@/lib/readerExtract`) returns **plain text
  blocks — headings, paragraphs, list items, quotes, code — never HTML**, which the dialog
  renders as React elements, so a pasted `<img onerror>` or script is text, not DOM. It
  prefers `<article>`, then `<main>` (only if it holds ≥400 chars, so a teaser doesn't
  win), then the body, and drops nav/footer/aside/forms. Links and images are not carried;
  *Open original* is the way to them. **The page is never stored** — fetched fresh each
  time (browser-cached 10 min) — only the reader's **highlights** are, on the bookmark
  (`Bookmark.highlights`: `{id, text, createdAt}`, ≤30 a bookmark, ≤600 chars each,
  because bookmarks share one 1 MiB Firestore document). A highlight is found again **by
  its text** within a single block, so one the page has since changed just isn't marked,
  and a selection spanning paragraphs is refused with a message. Highlights are a field on
  the record, so **every whitelist that rebuilds a bookmark must name them** —
  `normalizeBookmarks` (device cache and JSON import) and `sanitizeBookmark` (cloud save,
  fetch and backups) both go through `cleanHighlights`; `firestoreBookmarks.highlights.test.ts`
  pins the cloud round trip. **Browse by tag** is a chip row on the home page
  (`@/utils/tagBrowse`: case-insensitive counts, most used first) that narrows `filtered`,
  so the folder view and Trending follow it.
- **Read later is two timestamps on the bookmark, and the queue is derived**
  (`@/utils/readLater`; `Bookmark.readLaterAt` = queued, `readAt` = finished). A queued
  bookmark with no `readAt` is in the queue, **oldest first** so nothing sits forgotten behind
  newer arrivals; finishing sets `readAt` (kept, so a bookmark can say "Read"), *Queue again*
  clears it, *Remove* clears both. There is no separate list to drift from the bookmarks,
  and because they are fields on the record **both whitelists must name them**
  (`normalizeBookmarks` and `sanitizeBookmark`, via `cleanReadLater`; the cloud round trip is
  pinned in `firestoreBookmarks.highlights.test.ts` — the same trap highlights had). Fed from
  four places: a **Read later** row on every `BookmarkCard` (`ReadLaterToggle`; the icon row
  has no room for a seventh button at 320px), the Add Link form's checkbox, the reader
  dialog, and the **Share sheet, where it is ON by default** — a link shared from another app
  is almost always something to read (one tap to untick). The home page's `ReadLaterCard`
  lists the queue (five, then *Show all*), with Read / Done / ✕ per row; it looks the open
  bookmark up in *all* bookmarks, so marking it read inside its own dialog doesn't close the
  dialog under the reader. "Waiting 2 weeks" is calendar days in the local zone
  (`waitingLabel`), never 24-hour spans of the UTC instant. `e2e/read-later.spec.ts`.
- **Bookmark Deck is not a password manager, and the forms say so** (`@/lib/credentialGuard`,
  `CredentialNotice`). A bookmark's note, a paper's Reference and Note, a reminder's label
  and an item's Notes **refuse** text that looks like a password, PIN, card security code,
  payment card number or government ID number — inline, with the reason and where it belongs,
  and the save is blocked (the bookmark card stays in edit mode). That makes the Terms'
  "do not store passwords, PINs, payment card data, government IDs" enforced behaviour. The
  patterns are narrow on purpose, because a false refusal costs an edit and a bare run of
  digits is usually a policy or order number: a **label** (`password:`, `PIN: 4821`, `cvv 123`)
  whose value is not a pointer ("see Bitwarden"); a **card** needs an issuer prefix, the
  right length *and* the Luhn checksum; an **SSN** needs the 3-2-4 shape with a valid area, or
  a label. A field left as it was stored is skipped (`firstCredential`'s `was`), so a record
  that predates the check stays editable. Not covered: import, restore and sync write
  whatever they carry, and inventory encrypts nothing (locked notes and locked Filing papers
  are the places the operator cannot read). `SECURITY-LAUNCH-PLAN.md` §2 is the plan.
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
- **In Notes, Inventory, Filing, Habits and Focus's records a write is queued FIRST, signed in or not, and
  leaves the queue only once the server acknowledges it** (`durableSave` /
  `durableDelete` in `@/utils/pendingDeletes`). "Connected" means signed in to
  Firebase, not online, and Firestore's cache is memory-only: a write made signed
  in but offline lived in that tab's memory, so a tab closed before the network
  returned lost it — the next load's snapshot put the old copy back, or brought a
  deleted record back. A per-record generation keeps an older write's
  acknowledgement from un-queuing a newer one; a write refused for good
  (`permission-denied`, `invalid-argument`) leaves the queue instead of being
  retried forever. On connect `replayUpserts` / `flushPendingDeletes` take each id
  off only once it lands — they used to clear the whole queue, failures included.
  **The connect fetch is the server's answer only** (`getDocsFromServer`, and
  `getDocFromServer` for settings; retried by `@/utils/untilAnswered` on `online`
  and every 15 s, thrown on a refusal): offline, `getDocs` answers from the empty
  memory cache, and every queued edit would read as deleted on another device and
  be dropped. The replay sends each record **from the device cache**, not the
  tab's own copy: another tab may have edited a queued record since this one
  loaded, and its load-time copy landed after that edit and undid it. Notes' editor counts a save as done once it is
  on the device — it used to wait for the cloud, and offline its one-at-a-time
  saves stalled after the first. Notes' conflict base is not taken from a snapshot
  carrying this page's own unsent edit (that hid a conflict). Known limit: a record
  deleted, then restored before the delete was acknowledged, with the tab closed
  before the restore lands, reads as deleted elsewhere next load and stays deleted.
  **Habits and Focus keep no `syncedIds`**: on connect they replay every queued id
  from the device cache, whatever the cloud holds, and fetch nothing (settings
  aside). So a create made offline goes up too, but a queued edit to a record
  deleted on another device brings it back — last writer wins. A day's legacy
  journal note has its own queue (`journalNotes`, by day); it used to go straight to
  the cloud and was never queued, even signed out. Focus settings queue a change at
  once, before their 600 ms save delay. Their record subscriptions take the
  cache-only guard too (`onConfirmedSnapshot`). Not covered: the cloud-only logs
  (focus sessions, scores, activity, meditation, Let Them), which keep no device
  copy to send. (Bookmarks and shortcuts sync by hand; Focus's cups have their own
  outbox.) **A hook replays only once THIS account's cache has loaded**
  (`loadedFor === email`): on a hard load the email arrives after mount, and in
  that render the signed-out key's state was written over the account's cache
  while the connect in the same commit replayed from it — pushing default Focus
  settings over a queued change, and un-queuing records it couldn't find. Habits
  and Focus also leave a queued id the replay can't find (`keepUnsent`).
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
- **One `SyncBanner` says the same thing on every cloud-backed page** (Focus, My Stuff,
  Filing, Notes, Habits): not connected → "Your {subject} stay(s) on this device" and one
  *Sign in to sync* button; connected → a "Synced" line, with the two manual buttons where
  a page has them (`onSyncFromCloud`/`onSyncToCloud`) or hidden (`hideWhenConnected`, Notes
  and Habits sync live). Filing replaces the connected line while papers load
  (`connectedMessage`). It was the same markup copied into five files with drifting
  wording; Habits had a different pill. Bookmarks is not one of them: it syncs by hand, by
  design, with its own controls. `e2e/sync-banner.spec.ts` checks all five.
- **Every dialog is the shared `Modal`** (`components/Modal.tsx`), and `src/lib/dialogs.test.ts`
  fails on a new hand-built one. About 25 were hand-built before, each missing some of what
  `Modal` does: **Escape**, a **focus trap**, **focus returned** to what opened it, **page scroll
  locked** behind it, and a backdrop that closes on a **press** (the old `onClick` closed it when
  a text selection ended on the backdrop). Two had no dialog role at all (the shortcut editor and
  Delete-all), so neither screen readers nor the check below could see them. Things the shared
  one now gets right, each pinned in `Modal.dom.test.tsx` / `e2e/dialogs.spec.ts`: **an `autoFocus`
  field keeps focus** (it used to be overridden by "first button"), and **the opener is recorded
  during render** — an `autoFocus` field grabs focus during React's commit, before any effect, so
  an effect recorded the field itself and focus fell to `<body>` on close (state adjusted during
  render, because `react-hooks/refs` forbids a ref there); and **with one dialog opened from
  another** (Add link → New folder) **only the topmost handles Escape/Tab** — topmost being nested
  deepest in React's tree (context depth, which crosses portals), then opened last, because a
  dialog rendered inside another's children mounts in the same commit with its effect first and
  the DOM order puts it *first*. Three stay hand-built, with reasons in the test: the timer's
  `alertdialog` (chimes on repeat), and the two mobile action sheets (`RowMenu`, the folder
  manager's), which share state with a desktop dropdown so a modal would lock scroll and trap
  focus invisibly there. **A new dialog is `<Modal open onClose label …>`**; for a bottom sheet or
  full-bleed viewer pass `overlayClassName`. Keep the `{cond && <Modal open …>}` shape when the
  body reads data that is null while closed. **Not verified on a device:** the shortcut touch
  menu opens on a long press with the finger still down; it relies on the post-touch mouse events
  targeting the tile, not the overlay.
- **UI that opens on its own never lands on top of another dialog.** The first-run
  welcome (`Onboarding`) opens after a cloud check, so it used to cover whatever the user
  had just opened. It now waits until the page has been dialog-free for a moment
  (`@/lib/dialogPresence`: any `aria-modal="true"` element — the shared `Modal` *and* the
  hand-built overlays — plus the ⌘K palette's open event) and counts as seen only once
  shown. Once open it stays: closing one `Modal` under another hands body-scroll
  restoration to the wrong one. A new hand-built dialog must keep `aria-modal="true"`
  or this can't see it.
- Existing pages: `/` (home), `/folders/[folderKey]`, `/folders/manage`, `/folders/unstaged`,
  `/focus`, `/habits`, `/habits/guide`, `/inventory`, `/filing`, `/notes`, `/notes/[id]`,
  `/share` (Share-sheet target, below), `/guide` (site guide), `/faq`, `/privacy`, `/terms`,
  `/login`.
- **Saving from the Share sheet.** `manifest.ts` declares a GET `share_target` → `/share`,
  so the installed app is offered in Android's Share menu (iOS has no web share target;
  the guide says so). `parseSharedLink` (`@/utils/sharedLink`) takes the link from `url`,
  else the first http(s) link in `text` — Chrome on Android sends it there — and refuses
  any other scheme. The page saves through `useBookmarks` like ＋ Add Link (device cache;
  cloud sync stays explicit) and waits for `hydrated`, so a save can't land before the
  account's cache loads. **A share while signed out survives sign-in:** login and the
  gate both honour `callbackUrl` through `returnPath` (`@/utils/returnPath`), which keeps
  only a path on this site — before, login always went to `/`. `e2e/share.spec.ts`.
- **"Your week" on the home page** (`WeeklyRecapCard` + pure `@/lib/weeklyRecap`): this week
  (Monday → today, local days) **beside** last week — not as a change, since a young week
  always reads as a drop. Rows appear only with activity in either week. Read from the
  device caches (habit entries and inventory items by key, notes via `readNoteDates`,
  bookmarks from the page's own hook), computed on render and stored nowhere; only the
  "hidden for week X" flag is kept (`bd:recap:hidden:v1`, per device). Focus time comes
  from `subscribeSessions`, and **only over a Firebase session that already exists for
  this account** — subscribing without one would open the sign-in popup from the home
  page. `e2e/recap.spec.ts`.

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
    Test-only helpers live in `src/test/` (`webLocksMock.ts`: pages, their Web Locks, and a
    page closing; `hydrationCloud.ts`: an in-memory `focusHydration` for hook tests).
  - Eight **source-scanning** tests sit in that node project and assert properties of how
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
    see **Day keys are LOCAL** above), `src/lib/dialogs.test.ts` (no hand-built dialog —
    see **Every dialog is the shared `Modal`**), and `src/lib/apiLogging.test.ts` (no
    `console.*` in `src/app/api`: handlers see request bodies, and the host keeps what they
    print; a real need goes in its `ALLOWED` map with a reason).
- **The session gate is `middleware.ts`, and route-handler tests cannot see it** — they call
  the handler directly. That blind spot let background push and billing ship dead: the
  matcher sent QStash's and Lemon Squeezy's cookieless webhook POSTs to `/login` with a 307
  before their signature checks ran, while 51 passing `push/*` route tests said nothing.
  The matcher now names its exemptions explicitly (the two webhooks and the PWA files),
  and `e2e/machine.spec.ts` asserts each is answered by its route **and** that neighbouring
  routes stay gated. **Exempting a route makes its own gate the only gate**, so any route
  added to that list needs a route test proving its check rejects a forged request.
  The billing webhook also drops an event older than the stored entitlement (`updatedAt`,
  from Lemon Squeezy's `updated_at`): deliveries retry and arrive out of order, and a late
  "active" landing after "expired" used to hand pro back for good.
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
  `tsc --noEmit`: ESLint is the sole check that catches a lint-level regression. The 84
  remaining *warnings* are **all one rule** — `react-hooks/set-state-in-effect`; only
  errors fail the build. That the set is homogeneous is the useful part: a warning from
  any other rule is new, and worth reading rather than assuming it is backlog.
  **They are not all the hydration pattern**, which this line used to claim. Classified
  by the shape of the effect each sits in (2026-09-16):

  | Shape | Count |
  |---|---|
  | cloud subscribe / fetch (`[canSync, email]`, `[connected, email]`) | 28 |
  | mount-only — the hydration read below, plus one-shots like `setMounted(true)` | 13 |
  | modal / panel reset on open (`[open, …]`) | 14 |
  | other storage-backed reload (+2: `useNotes`' and `useVaults`' cache loads, `[email]`) | 16 |
  | **derived-state reset** | **13** |

  Hydration-shaped effects are about **29 of 84**; the biggest group is Firestore
  subscriptions, which have nothing to do with hydration. The distinction earns its
  place because the blanket version of it is how #292's regression stayed in `main` for
  months — a deleted button whose orphaned state warned for exactly this rule, waved off
  as expected backlog.
  **If the count ever moves, read the derived-state 13 first**: they are the ones React
  advises deriving during render (or resetting via `key`) instead of writing from an
  effect. All were inspected on the date above (plus one added since, `useStableEmail`'s
  own derived-state reset — a session value is held back, not re-derived, while offline;
  the retired Simple habits view's own entry left with its deletion) and are sound — each
  uses a functional updater or an early-return guard, so none can loop or fight user input —
  but that is a finding with an expiry, not a permanent property.
  **The count has moved once, and back, without a fix either way**: `useHydration`'s
  per-account cache load (an "other storage-backed reload", deps `[email]`) went quiet
  (84 → 83) when its day began flowing through `dayRef.current` — the rule exempts state
  set from a ref read — and warned again once the read moved into a `loadDay` callback
  beside `setHydrated`. The same load throughout. A drop is as worth explaining as a
  rise: the rule can go quiet without the code improving. **86 → 83 was deletion,
  not a fix:** the retired Simple habits view took three with it — its sort-mode
  and view-setting reads (mount-only) and its selected-day reset (derived-state).
  **CI runs Node 22** (all four `setup-node` pins, across both workflows). That is
  load-bearing, not incidental: `jsdom` 30 requires `^22.22.2 || ^24.15.0 || >=26.0.0` and
  fails to load on Node 20, and `vite`/`rolldown` declare `^20.19.0 || >=22.12.0` floors.
  The trap it closed is worth remembering — a local Node of exactly `v22.22.2` ran all 785
  tests while CI on 20 reached 773, so "green locally" proves nothing about CI unless the
  runtimes match. Check `node -v` against the workflow before trusting a local run.
  **Workflows run with `permissions: contents: read`, and every action is pinned by
  commit SHA** with its tag in a comment (a tag can be moved); Dependabot's
  `github-actions` entry keeps the pins current. actionlint's installer is fetched by
  commit too.
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

**`npm audit` is not 0, and what remains is dev-only.** As of 2026-11-05 it reports 10
*moderate* advisories (18 two days earlier — the count moves with npm's advisory data, not our
code, so don't pin to it), all one chain: `eslint` / `@typescript-eslint/*` / `eslint-config-next` /
`eslint-plugin-*` → `glob` + `minimatch` (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249). Both are
denial-of-service through crafted glob *patterns*; the only patterns they see are the lint
plugins' own, at lint time, over this repo — nothing user-supplied, nothing shipped. npm's
"fix" is a nonsensical ESLint downgrade, and the real one waits on `eslint-config-next`
supporting a newer ESLint (see the Dependabot table). The old note named `braces`
(GHSA-vfj7-8cjw-p6xm); that advisory no longer appears. **Any `high` or `critical` line is new
and real**: the same day, an audit found `next` 16.0.0–16.4.0 carrying two unauthenticated
remote-code-execution advisories (image optimization with SVGs; `use cache`) and a Server
Actions DoS, plus `zod`, `re2js` and `undici` highs — all fixed by `npm update` within the
existing ranges (next 16.4.5). Advisories land without a code change, so **run `npm audit`
before merging anything, not only when touching dependencies.** **`npm run audit`** is that
check with the policy applied (`scripts/audit.mjs`, decisions in `scripts/audit-policy.mjs`,
pinned by `src/lib/auditPolicy.test.ts`): anything in the production tree fails at any
severity, `high`/`critical` anywhere fails, and the standing dev-only moderates are listed but
pass — bare `npm audit` exits non-zero on them forever, which trains people to ignore it. Exit
0 pass, 1 policy failed, 2 could not audit (registry unreachable — unknown, never a pass). It is
**not a CI gate** on purpose: an advisory landing would turn every unrelated PR red. Update with
`npx -y npm@11 update <pkg>` and read the lockfile diff: the sandbox's own npm 10 rewrites the
whole file (drops the platform binaries' `libc` fields) where npm 11 changes only what moved.

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

**`@capacitor/local-notifications` is back** (`^8.3.1`). It was bumped in #307 and then
removed as unused — nothing imported it, the timer alert being the hand-written Swift
`TimerAlert` plugin. It is now imported by `features/inventory/lib/nativeReminders.ts`
(on-device dated reminders in the native shell; a no-op on the web, dynamically imported
behind `Capacitor.isNativePlatform()`). The custom `TimerAlert` is still there; 8.1.0's
`interruptionLevel: 'timeSensitive'` is what could replace it (`CAPACITOR_IOS.md` §2). Its
only peer is `@capacitor/core >=8`, so it adds no transitive packages. **When adding to the
lockfile, check the diff:** a different npm version rewrites it wholesale (the platform
binaries' `libc` fields vanish), which is noise to avoid, not accept.

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
  (`{ cups, ops }` — `ops` holds receipts, see Hydration), `activity/{id}` (unified log), `focusScores/{id}` (one doc
  per answered "Need a push?" quiz — points/topic for Scores history), and
  `meditationSessions/{id}` (`{ minutes, kind, pattern?, day, createdAt }`).
  Optimistic
  + fail-safe. Rules: `src/features/focus/FIRESTORE_RULES.md` (deployable
  `firestore.rules`).
- **To-dos repeat and carry a priority** (`lib/recurrence.ts`, `useTodos.toggleTodo`,
  `TodoOptions`). Completing a repeating to-do (`repeat`: daily/weekdays/weekly/monthly,
  which needs a due date to anchor on) leaves it in Done and files the **next**
  occurrence: the first date on the cadence that falls after the completion day, time
  of day kept, monthly anchored on the original day of the month. Missed occurrences
  are not queued — finishing Monday's chore on Thursday files next week's, the opposite
  of Filing's roll-forward-one-period, because a chore has no "still overdue" to show.
  The next one's id is `{base}~{due day}`, so two devices completing the same to-do
  file one record, not two. Un-completing removes that occurrence unless it was done
  itself; `toggleTodo` returns `{ spawned, removed }` so the dashboard mirrors them to
  Google and the Undo withdraws them. **`toggleTodo` reads `todosRef`, not the list it
  was created with**: the Undo toast holds a callback from the completion's render,
  and deciding from that list would complete the item again. `priority` is `high`/`low`
  (omitted = normal) and sorts high first; `saveTodo` writes `repeat`/`priority` as
  `null` when absent, since `merge: true` would otherwise keep a removed one. The
  backup's `coerceTodo` also keeps `list`, `project` and `completedAt` now — it dropped
  them, so a restore turned Project to-dos into Personal ones.
- **Google sync is two-way, with a three-way rule** (`lib/googleReconcile.ts`,
  `useGoogleTodoPull`, `/api/google/todos/status`). A to-do is mirrored OUT whenever it
  changes (`useGoogleTodoSync` → Tasks + a Calendar event for a timed one); the pull is the
  way back — on enabling, on tab focus (at most once a minute) and every 5 minutes it asks
  Google about each open, mirrored, personal to-do. Each to-do carries `gsync` (`{dueAt,
  done}`): **what Google held when we last pushed or adopted**, recorded only for a write
  that landed (the mirror route reports `synced.task/event`; it used to answer 200 after
  swallowing a failure). Google differs from `gsync` while local equals it → Google changed
  it, adopt; local differs from `gsync` → we changed it, leave it for the next mirror; both →
  local wins, so a pull can never undo an unpushed edit. Adopted: completed in Google Tasks
  (through the same `toggleTodoWithUndo` path, so a repeating one files its next), and a
  moved timed event (`editTodo` without mirroring back). A Task/event deleted in Google just
  unlinks (the to-do stays; its next mirror creates a fresh one). Not adopted: a Task
  reopened in Google, an all-day move, or a time change on a to-do first seen without a
  snapshot (that pull only records a baseline). The Agenda also **writes**: ＋ Add event and
  delete (two clicks), on the **primary calendar only** — the routes hard-code `primary`, and
  the UI offers delete only on `primary` events. The client sends the picked date and time as
  an instant (the server can't know the zone) or a bare day for all-day.
- Tasks (`useFocusTasks`): reusable across days; an **active task** receives the
  timer's focus minutes (via `taskId` on sessions); auto-resumes the most recent;
  mark done / archive. Per-task time is derived from `focusSessions` (not stored).
- Timer (`useFocusTimer`): settings-driven, timestamp-based (accurate when
  backgrounded), Web Audio chimes (`lib/sound.ts`) + notifications (`lib/notify.ts`),
  auto-start; attributes blocks to the active task.
- **The meditation voice is the browser's own speech, made less robotic** (`lib/voice.ts`,
  `VoiceOptions`). Offline and free, so the ceiling is what the device's voices allow:
  `scoreVoice` ranks installed English voices (neural/"Natural"/enhanced/Google above
  the old Microsoft desktop voices, eSpeak and macOS novelty voices last), the listener
  can pick one and a pace (slow/calm/natural) and hear it, and a guide step is spoken
  **a sentence at a time with a pause between** rather than as one run-on line, with a
  slight pitch/rate wobble so lines aren't stamped from one mould. The choice is
  **per device** (`bd:meditation:voice:v1`, not synced — voice names differ by device, and
  a name saved elsewhere falls back to the best voice here). A generation counter stops a
  replaced or cancelled sentence chain from talking over the new line. **An optional
  "Natural" engine** (`engine: "cloud"`, listener's choice, only offered when `GET
  /api/tts` says `OPENAI_API_KEY` is set) sends each sentence to `POST /api/tts`
  (`gpt-4o-mini-tts`; model via `TTS_MODEL`), which is session-gated, rate-limited (60/min)
  and capped monthly (`withinFreeQuota(email, "tts", 5000)`, fails open without Redis). The
  manner (`NARRATOR_INSTRUCTIONS`), model and format are fixed server-side — the client
  picks only text (≤500 chars), one of the listed voices and a clamped speed — and a
  provider error is never relayed. `lib/cloudVoice.ts` keeps each clip in memory and in
  Cache Storage (`bmd-tts-v1`, newest 300, exempted from `sw.js`'s cleanup — a test pins
  the two names together), prefetches a session's lines at Start (`prepareNarration`,
  from the tap that also unlocks the reused `Audio` element), and `speak()` falls back to
  the device voice **per line** when a clip can't be fetched or played, so narration never
  goes quiet. Only cue wording leaves the device (privacy page says so).
- **Soundscapes** (`lib/sound.ts`, `useFocusAmbient`): rain/brown noise/wind/ocean/soft
  noise/drone, generated with Web Audio (no files), played behind a running focus block
  (Pomodoro focus mode or the stopwatch — never a break or a pause) and chosen under the
  timer (`focusAmbient`, `focusAmbientVolume` 10–100, default 50). The engine has **two
  channels**, `focus` and `meditation` (the default, so `useMeditation` is unchanged):
  one soundscape per channel, so a meditation neither cuts nor is cut by the focus one.
  A volume change moves the running gain; it never restarts the sound. Audio needs a
  gesture, so both Start buttons call `initAudio()`; a timer restored from a reload
  sounds on the next tap. `sound.dom.test.ts` drives a recording fake of the Web Audio
  graph — it can't judge how anything sounds, only that every soundscape starts a
  source, a stop releases every source and the rain's droplet timer, and channels
  stay independent.
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
  Firestore sync (`focusHydration/{day}`) + `QuoteBox`.
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
  **Every cup added or removed goes to the cloud as an increment, through the
  outbox (`@/lib/hydrationOutbox`); the count on screen takes whatever the record
  says and is never written back.** Every write used to be the count on screen, so
  the last writer won: a laptop that lost its network for an hour replaced the
  phone's cups with its own number on reconnect, a stale cache put back a cup
  removed elsewhere (the first answer merged with a `max`), and two tabs each kept
  only their own cups. A day's `cups` is still the running total, so the history
  chart and a tab on the previous bundle read it unchanged. `saveHydration`
  (absolute) is now only for a backup restore.
  **The outbox exists because Firestore keeps queued writes in tab memory** (the
  memory cache): an increment queued offline dies with its tab. So each change is
  stored — one localStorage key per change, never a shared list — under a Web Lock
  its page holds while the change is stored and while the page sends it, until the
  server acknowledges it; a change that waits for a flush has its lock released
  once stored. A page that closes releases its locks when its queued writes die,
  so a change whose lock is free is one nobody is sending.
  Each write carries a receipt, `ops.{id}`, in the same atomic batch, and a change a
  page didn't just send is only ever delivered by **`recoverHydration`: one
  transaction that reads the day from the server and writes nothing if the receipt
  is there** — "landed, acknowledgement lost" is settled, not counted twice. It was
  a `getDocFromServer` read and then a send, and review proved it double-counted:
  with a listener already open on the day (every Focus tab has one), that read is
  answered from the listener's view, which can lag the very write it looks for.
  A removal is clamped (`maximum(0)`) in the batch, so one reaching an empty
  record leaves no debt to eat the next cup. A change that can't be stored (storage
  full or blocked, a lock request refused, no Web Locks) is kept in the page's
  memory and delivered by its next flush.
  **A page keeps the order of its own changes to a day**, because a removal sent
  ahead of the cups it removes reaches 0, is clamped there, and the day ends high
  by what it removed. What it sends goes through the SDK's queue, in order. A
  change made while the page has changes of its own to the day waiting for a
  flush waits behind them — and only its own: another tab's change in flight used
  to send this page's next one by transaction, which overtook this page's own
  queued send (review measured 8 for 1 on the emulator). A flush leaves a day
  alone while the page is still sending to it, or while another page is
  delivering one of its changes to it; a page runs one flush at a time per
  account; and changes are ordered by a per-page stamp that never repeats or
  steps back, not the wall clock alone. Between pages there is no order (below).
  **The outbox is handed over** on the day's first server answer, on `online`
  (`connected` is sign-in state and stays true offline, so "on connect" never fires
  when the network comes back), on focus/visibility, and by *Sync to cloud* — which
  never writes the count on screen. A flush that leaves something undelivered sets
  a retry (due at once after a day it left alone, backing off from 15 s to 5 min
  after failures), which Focus's clock and the habits water link run: a server
  outage fires no `online`. Offline, a recovery transaction gives up after about
  8 s of retries (measured). Habits hands the outbox over too — only through a
  linked water habit, while synced (below) — so a Focus tab that closed offline
  still delivers when habits opens first. Cups taken while not connected are
  recorded and delivered on connect; a cached count no outbox entry accounts for is
  never uploaded, because it can't say which of its cups the cloud already has.
  **The session that supplies `email` is not refetched on focus while offline**
  (`src/app/providers.tsx`): next-auth refetches it whenever the tab becomes visible, a failed
  fetch made it null for good, and every pillar lost its account — cups taken
  were recorded nowhere, and the outbox was never handed over.
  **`serverFirst` holds back two kinds of snapshot** (`subscribeHydration`).
  Cache-only answers before the server has answered: offline, a record another
  device wrote reads as *missing* from the cache. And **any snapshot carrying this
  page's unacknowledged writes**: the SDK lays an increment over the count it had
  cached when the write was made, not over the server's, so against the emulator a
  cup taken before the day was ever read showed as the day's only cup (4 → 1 → 6),
  and one taken offline hid the phone's cups until the acknowledgement came back.
  **The history chart (`subscribeHydrationHistory`) holds back more, and for
  longer, than that one guard suggests.** `hasPendingWrites` is a flag on the
  whole query snapshot, not per document, so one unacknowledged write to *any*
  day freezes the chart's view of every day in it — including a different
  day's update that already landed on the server from another device — not
  just a brief first-load window. It stays frozen for as long as that write is
  outstanding (an outage can hold it for the outage's whole length), then
  converges once the write is acknowledged. Unlike the tracker (which shows its
  own change from `countRef` regardless), the chart shows no optimistic value
  of its own meanwhile, this page's included.
  The hook shows its own changes itself, from a synchronous `countRef`, and makes
  its writes outside state updaters, which StrictMode runs twice. *Download*
  (`fetchHydration`) answers `undefined` while such a write is pending, and the
  count on screen stays. The activity log states a total only once the day's
  record has been read and nothing of the day waits in the outbox.
  **Habits' water link moves the same way** (`trackableSources.ts`, the hydration
  source). A tap is sent as the change it makes — `mirror(ctx, value, previous)`
  records `value − previous`, and moves Focus's cache by that change rather than
  to the habit's count — and every snapshot is adopted (`mergeStep`,
  bidirectional). **Nothing is pushed back**: the first snapshot used to max-merge
  and push a higher habit count to Focus, and with Focus's cups waiting in the
  outbox the habit's count already held them, so the outbox then added them a
  second time (review measured 7 for 5, and 8 for 6 after a tap). An increment
  isn't idempotent; a count pushed back never is. **An adoption writes only the
  count** (`saveEntryCount`): this device's copy of the entry can be older than
  the cloud's — the hydration listener opens before the entries one — and writing
  it whole erased a note and time logged on another device. One made while not
  connected isn't queued, since once connected the habit takes the record's count
  again. The habit's entries doc is a second, absolute copy of the count, though:
  a write that isn't an adoption can leave it off the record's count until the
  record next changes, and "set" actions (a toggle to the target, a logged count)
  are relative to the count the habit shows. **Undo** takes back only the tap's
  change to the count — restoring the count from before the tap erased cups
  adopted from other devices since — and puts back the rest of the entry (note,
  time) from before the tap. A tap made under a link the habit no longer has, or
  without the one it now has, isn't offered for undo: as a change to Focus it
  would take back cups it never sent. (Water only: a raise-only source's undo
  still restores the snapshot outright.) **Undo resends the tap's own increment,
  not the server's.** If the server clamped the tap's removal (another device had
  already taken some or all of those cups off), undo still adds back the full
  amount the tap asked to remove, not what the clamp actually let through — so
  the tap and its own undo don't cancel to zero, and can hand the day a cup that
  was never there. **Linking a habit** (turning sync back
  on, or a rename that makes it match) makes today's count Focus's: cups logged on
  the habit while it was unlinked are replaced, not added — the habit can't tell
  them from cups already on their way through the outbox, and adding those is the
  double count above. A record at 0 removes today's entry, note included; with no
  record yet the habit keeps its own count until one appears. Past days are
  untouched. In `useHabits` every
  entries write goes through `commitEntries`, which moves `entriesRef` with the
  state: snapshots land several to a render (one per recovered change), even
  between a render and its effects, and an effect copying the rendered entries
  into the ref put an older count back over a newer one. Actions read the
  current entry from the ref too, so two taps in one batch count from each other.
  **Focus's day rolls over on its own clock** (a 15 s check plus focus/visibility,
  and when a cup is added or removed or *Download* runs; *Sync to cloud* is
  day-agnostic) — it used to live inside the reminder loop, so with reminders off
  a tab left open overnight carried yesterday's count into today. **A rollover
  writes nothing to the cloud** (it wrote 0 to the new day's record, over cups a
  phone had logged while the laptop slept), and **the live record follows the
  current day**. A change still on its way keeps its own day in the outbox.
  The fake cloud (`src/test/hydrationCloud.ts`, shared by both pillars' hook tests,
  and `useHabits.dom.test.tsx` runs habits and Focus against one) models queued
  writes, receipts, recovery, a lost acknowledgement and a tab closing;
  `src/test/webLocksMock.ts` models pages and their locks. **A page in these tests
  is its own module instance** (`vi.resetModules` and a fresh import; the fake
  cloud lives on `globalThis` so every copy shares it): pages that shared one
  module shared its state, and a test of two pages ran one. Neither fake can show
  what the SDK does, so the snapshot rules are pinned on `onSnapshot` in
  `focusData.test.ts`, and the whole path was run against the real SDK on the
  emulator — including a listening tab whose watch was paused behind a proxy. Note
  for such runs: `disableNetwork` doesn't stop a transaction, so an outage has to
  be made at the network.
  **Known limits:**
  - *A rare double count.* The SDK re-sends unacknowledged writes after a connection
    drops, so inside a live tab an increment it sends can very rarely apply twice;
    and a write already on the wire when its tab closes can land after another page
    has recovered it. Delivery by `recoverHydration` is exactly-once; only a rule on
    `ops` in `firestore.rules` could close the cases of a direct send.
  - *Back/forward cache.* A restored page reloads (`pageshow`) when a send is
    unacknowledged and every change it holds is stored, in case its locks lapsed
    while it was frozen — never when a change is held only in memory, which a
    reload would lose. Chromium never restores a page holding a Web Lock, so there
    it never fires; other engines are assumed, not tested.
  - *The previous bundle.* Its tabs write absolute counts until they reload, and cups
    that exist only in an old-format cache, from a tab that closed before its merge
    ran, are not recovered. Its first-answer merge uploads the larger of the cache
    and the record, and the cache now holds cups still in the outbox, which a later
    flush adds again. Reverting this change does the same with whatever the outbox
    holds.
  - *Order between pages.* A removal that reaches the server at 0 before the cups
    it removes, still held by another page (or one that closed), leaves the day
    high by what it removed: one cup for Focus, a habit's whole count for an
    un-toggle, clear, skip or undo. Within a page the order is kept.
  - *A change another live page's lock holds isn't this page's to retry.* A
    flush that finds a day's stored change locked elsewhere skips it without
    arming (or owing) a retry for it — correctly, since that other page is the
    one delivering it. But if that page then closes mid-delivery during an
    outage that never fires `online` (the network stays "up" to the browser),
    the change is orphaned with no page's clock retrying it, until some other
    event (a focus/visibility change, a new tap, a reconnect `online`) triggers
    a fresh flush that claims it. Ten minutes of elapsed time alone does not.
  - *Display.* Offline, a tab doesn't see another tab's cups until they land, and a
    change recovered from the outbox shows only once acknowledged.
  - *Kept in memory* (no Web Locks — an insecure context, Safari before 15.4 — or
    storage full or blocked): cups queued by a tab that closes before they land are
    lost. Without Web Locks the previous code got them back through the cache's
    `max` merge — the merge that counted cups twice.
  - *A change refused for good* (by the rules, say) is retried on every flush and,
    backing off, every 5 minutes, and holds back the changes after it on its day.
  - *Size.* One `ops` key per change in each day's record (10–20 a day), never
    pruned, and the history listener downloads every day's; a device that never
    syncs keeps only its newest 500 changes.
  - *A restore stays absolute.* A change the restoring page has sent but not had
    acknowledged lands before it and is erased; changes held elsewhere (the outbox,
    another page) land on top of it.
  - *The session offline.* `useStableEmail` (`src/lib/useStableEmail.ts`, used by
    `FocusDashboard`/`HabitsDashboard` in place of a bare
    `useSession()`) keeps the last email while the device knows it's offline, so
    the next-auth session value itself going null doesn't lose cups or stop the
    outbox handover. The session value still does go null in every OTHER open
    tab, not only a focused one: next-auth posts a cross-tab broadcast after
    *every* session fetch, a failed one included, and every other tab answers
    it unconditionally — bypassing both `refetchOnWindowFocus`'s guard and the
    null-session skip. **The hook's own effect is keyed on next-auth's `session`
    object, never on `online`.** Review found the bare browser `online` event
    (from the hook's own `useSyncExternalStore`, not from next-auth) letting a
    still-stale, offline-suppressed null through the instant connectivity
    returns: next-auth's `online` handling only gates an unconfigured
    `refetchInterval` poll, it never itself refetches, so there is no real
    answer yet to trust. `session` is a fresh object reference on every actual
    next-auth fetch — even one that reconfirms the same email — so the effect
    only re-evaluates when next-auth has actually answered, while still reading
    whatever `online` is current as of that render. A captive portal (or any
    genuinely unreachable server while `navigator.onLine` stays true) is the
    one case `useStableEmail` can't tell from a real sign-out, so a null there
    still goes through once next-auth does fetch — the device itself can't
    tell the difference either.
- Shared-file touches (additive only): `AppShell.tsx` (Focus nav pill, mobile-safe),
  `icons.tsx` (`Timer`, `Settings`).

## Habits companion (`/habits`)

A small plant (`HabitCompanion`, `features/habits/lib/companion.ts`) that grows with your
check-ins and keeps you company. The brand call, made to fit "calm, private, no points
economy": it is **derived, not stored**, **only grows**, and **never scolds**. Its stage
comes from the count of every `done` entry ever made (a deleted habit's history still
counts; entries are only ever added, so it can't shrink — seven stages, Seed → Old tree at
0/1/7/30/90/200/500). Its mood comes from today: *radiant* when everything due is done,
*glad* when some is, *waiting* when none is, *resting* on a day with nothing scheduled, and
*welcome back* after 3+ days without a check-in — never a penalty, no wilting, no streak
loss, no missed-day count (a test fails if a line mentions miss/lost/wilt/streak/behind). One
line a day, chosen from the day's hash, so it doesn't reshuffle on every render. Only its
**name and a hidden flag** are stored, **per device and account** (`bd:companion:v1:{email}`),
read through `useSyncExternalStore` because the Habits page renders its main branch on the
server too and the server has no storage. The art is hand-drawn SVG (no files, no library).
`e2e/companion.spec.ts`.

## Habits health import (`/habits` → "Health data")

An **import, not a live link** — Google Fit's REST API ends in 2026 and Health Connect / Apple
Health are native-only, so a website can't read them; a live feed waits for the native app
wrapper. `lib/healthFile.ts` reads what the user picks **in the browser** (an Apple Health
`export.zip` or `export.xml`, a Google Takeout/Fit zip or CSV, or a plain CSV) as a stream — an
Apple export can be gigabytes — with a small ZIP/ZIP64 reader of our own and the browser's
`DecompressionStream`; no dependency, nothing uploaded. `lib/healthImport.ts` (pure) turns it into
days of steps / exercise minutes / sleep hours / mindful minutes. Rules that matter: **steps and
exercise take the larger source's total per day, never the sum** (phone and watch both record the
same walk, so a sum counts it twice); **sleep is the union of "asleep" intervals** (overlaps from
two devices counted once, in-bed time ignored) filed under the day you woke; CSVs from several
files combine by **larger value, not sum** (an aggregate file beside per-day files would double
every day); a Google per-day file is summed within itself. `Habit.healthLink` (`{ metric,
threshold }`, persisted by `serialize`, written as `null` when cleared) is what a habit is linked
to; the dialog guesses one from the habit's name (`suggestLink`) and the user confirms. A binary
habit is done on days the metric reaches the bar; a measurable habit takes the day's value as its
count (no sleep — a count is a whole number). **The import only ever adds**: a day already logged,
done or skipped, is never touched (`planHealthEntries`), it writes through `useHabits.importData`
(append-only), and Undo removes exactly the entries it created. **The health numbers are never
stored** — only the done-marks and the link. `e2e/health-import.spec.ts` drives a real CSV and a
real `export.zip` (built by `src/test/makeZip.ts`) through Chromium. Not verified against a real
Apple export or a current Takeout: the parsers follow the documented element/column names, and
the Takeout layout in particular is matched by header names, not by folder.

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
  (`setDoc`, no merge). Before that point documents cache whole — and so,
  after it, does any paper whose edit is still queued: slim, the edit itself would
  not be on the device for the next load to send.
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
  `focus-streak`, `filing-digest`, `inventory-digest`, `habit:{id}`; `/api/push/schedule` falls back
  to the timer's for anything else. **My Stuff has the same daily digest**
  (`useInventoryPush`, `features/inventory/lib/digest.ts`, opt-in from the 🔔
  Reminders dialog; `pushEnabled`/`pushHour` on `InventorySettings`). Its count is
  `reminderCount`, so push and nav badge agree; a PIN-locked My Stuff sends counts
  only, never item names. `msUntilHour` lives in `@/lib/msUntilHour` (Filing's
  digest re-exports it). **Habit reminders carry a "Snooze 1 hour" action**
  (`schedulePush({ snoozable })` → `snooze: true` through schedule and fire →
  `actions` in `sw.js`): the worker re-queues the same push itself and leaves a
  record in Cache Storage (`bmd-snooze-v1`, `@/lib/snoozeRecords`, exempt from
  `activate`'s cleanup) so `useHabitReminders` can cancel it once the habit is done
  — the page can't see a push the worker queued. If the re-queue fails the click
  just opens the app. iOS shows no notification actions. **A habit can remind at up to
  four times a day** (`reminder` = the first time, `extraReminders` the rest, read through
  `reminderTimes`: valid, unique, earliest first — two fields so a bundle or backup that
  knows only `reminder` still reads the habit). `useHabitReminders` queues one push per
  habit **and** time (map key `{id}@{HH:MM}`; an entry under the old bare-id key is not in
  the desired set, so it is cancelled and re-queued), all under the habit's single `habit:{id}`
  tag so a later one replaces an unread earlier one. A habit done today silences the rest of
  today's times. `habitToDoc` always writes `extraReminders` (as `[]`) so a removed time
  leaves the cloud copy too. The worker's badge is `icons/badge-96.png`,
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
  `CommandPalette` all hardcode it to read the same cache. The palette reads **only
  the signed-in account's** key — it used to read every `bookmarkdeck:v2*` key, so the
  next person to sign in on a shared computer could search the last one's bookmarks.
  `src/lib/storageKeys.test.ts` pins that set, along with the nine other keys
  hardcoded in more than one file — bump one copy and the reader silently reads
  nothing, which no other check can see.
- **A paper's reference and note can be LOCKED — end-to-end encrypted with the Notes vault**
  (`lib/lock.ts`, `FilingDocument.lock`, `DocumentFormModal`'s "Lock reference and note").
  Per paper, opt-in, like a locked note, and for the same reason (forgetting the passphrase
  costs only what was locked). The two fields are sealed as one JSON blob with AES-GCM under
  context `filing` and the paper's id as additional data, so a paper's seal won't open as a
  note or as another paper (`sealText`/`openText` in `@/lib/vault/vault`; Notes still seals
  under `note`, byte for byte). **The invariant:** a locked paper has NO plaintext `reference`
  or `note` in state, cache or Firestore, and `confidential` equals `Boolean(lock)`. It is held
  three times: `withLockInvariant` runs inside `withDerived`, which every write and snapshot
  passes; `mapDocument` reads a stray plaintext field beside a lock as absent (an old backup
  restored over a locked paper cannot resurface it); and `documentPayload` **throws** on a
  locked paper that still carries one. What stays readable is what lists, search, reminders,
  the badge and the shred queue run on — title, dates, folder, tags, aliases, obligations,
  activity — and the form says so before anything is locked. **Scans are encrypted
  separately, when they are added** (below), not by locking the paper. Locked text is not searchable and the CSV shows `(locked)` for the reference
  and nothing for the note; the JSON backup carries the seal. The decrypted text exists only
  in the open form's memory, and only while the vault is open: the vault locking again (idle
  timeout) puts the fields back to locked and an unsaved edit to them is not written
  (`secretsOpen`; Notes saves pending typing first via `onBeforeLock`, this does not).
  **What a submit writes** is decided by pure `planWrite` (new/edit × plain/locked × vault
  open/closed — a locked paper with the vault closed can still rename and move, and its seal
  is never touched). A new locked paper's id is generated before sealing, because the seal is
  bound to it. The slim cache keeps `confidential` so the list can show a lock beside a
  paper whose sealed blob has not loaded. **Place, party and folder `note` fields have
  nothing to lock:** they are in the types, the data layer and the JSON backup, but no screen
  or hook has ever written one (checked in git history), so they hold no text. A form for any
  of them must ship with the Lock option, or not store free text — the credential check and
  the lock exist for exactly this field shape. Not covered: an activity entry's note and an
  obligation's label stay readable (reminders need them).
- **A confidential paper is also hidden behind a PIN, and its name never leaves the app in
  plaintext** (`lib/confidential.ts`, `ConfidentialBar`, `@/lib/appLock`). *Confidential* is
  exactly *locked* (`isConfidential` = `confidential || lock`). **The PIN** is the shared
  device privacy lock (`@/lib/appLock`: a salted SHA-256 of 4–8 digits in localStorage, per
  account and per pillar, optional WebAuthn biometric — lifted out of My Stuff, which keeps
  its own key `bookmarkdeck:inventory:lock:v1` and behaviour; Filing's is
  `bookmarkdeck:filing:lock:v1`, so neither opens the other). While it is on, `shownDocuments`
  holds confidential papers back from **every list, the search, the folder counts, the
  Upcoming/Expiry/Ready-to-clear panels and History**; the dashboard keeps the whole set for
  what must not depend on the PIN (counts, the push digest, writes). **It is a privacy screen
  for a passer-by and NOT encryption** — the title is plaintext in storage and the sealed
  reference/note are opened by the vault passphrase, a separate thing; the copy says so. Until
  the lock's settings are read (`hydrated`) papers are held back, because we can't yet know
  whether one exists. **No PIN set → nothing hidden**, as before; the bar offers one when a
  confidential paper exists. *Lock now* also closes the vault (every key this tab holds,
  Notes' included) and closes any paper dialog, so nothing stays open that could show one.
  **What leaves the app regardless of the PIN:** a notification **counts** a confidential
  paper but never names it (`buildDigest` — a lock screen is the one place a title is public
  and no PIN reaches it; `useFilingPush` is fed the whole lists for that reason); the **CSV
  omits** confidential papers entirely (not their name, folder or dates); the **calendar
  file keeps their dates** but titles them `A confidential paper — Renew` with no folder
  trail. The **JSON backup** is the whole copy (sealed fields, readable titles) and so is
  **refused while confidential papers are hidden** ("unlock first") — a backup that quietly
  left them out would fail you later. **⌘K lists no papers at all**, so there is nothing to
  filter; an index added later must skip `isConfidential`. `e2e/filing-pin.spec.ts`.
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
  - **A scan is ENCRYPTED on the device before upload, by default, and is READ through
    a two-minute signed URL — never a public address** (`lib/scanCrypto.ts`,
    `AttachmentsModal`, `POST /api/filing/attachment/read`). The object is one blob,
    `iv ‖ AES-GCM`, sealed with the account's vault (the one Notes and locked papers use)
    under context `filing-scan` and the ATTACHMENT's id as additional data, so a sealed
    scan swapped onto another pointer won't open. It is stored and its type *signed* as
    `application/octet-stream` under a `.bin` key — the storage layer never holds a type it
    could serve it as — while the pointer keeps the ORIGINAL `contentType`, which the route
    still checks against the allow-list (SVG/HTML stay refused even sealed) and which
    `openScan` checks again before typing the decrypted bytes (anything else becomes
    octet-stream, so a tampered pointer can't turn them into a page). The pointer's
    `enc: { kid, name }` names the vault and carries the FILE NAME sealed too (the pointer's
    own `name` is the stand-in `Locked scan`) — "Jane Doe SSN card.pdf" is itself sensitive.
    Type and size stay readable. **Opening** asks the vault for the key (the shared unlock
    dialog), fetches the ciphertext and decrypts it here: an image previews in place (blob
    URL, revoked the moment it is closed or the vault locks), and a **PDF is a download** —
    `object-src 'none'` forbids embedding one, and a preview isn't worth loosening the CSP.
    Decrypted file names and an open preview are dropped when the vault locks. A scan
    stored unencrypted (the box unticked, or uploaded before this) opens in a new tab from a
    fresh signed URL and has an **Encrypt** button: fetch it, seal it here, upload the sealed
    copy, swap the pointer, and only after the new pointer is saved delete the old object
    (`useFilingAttachments.replace`). **The read route** is session-gated, requires the key to
    sit in the caller's own `filing/{userSeg}/` prefix (`isOwnedFilingPath`, so another user's
    object and another pillar's both read as `bad_path`), is limited per user, and answers
    `Cache-Control: no-store` — a signed URL is a bearer credential. That is what lets
    the bucket be **private**: nothing here needs `R2_PUBLIC_BASE_URL` any more, and new
    pointers carry no `url` (`FilingAttachment.url` is legacy, kept so old pointers read).
    `R2_FILING_BUCKET` (optional, `filingStorage()` in `lib/filingStorage.ts`, shared by the
    presign, read and delete routes so they can't disagree) names a separate private bucket
    while item photos stay on the public `R2_BUCKET`. **Reading a sealed scan is a browser
    `fetch` of the signed URL, so the bucket's CORS must allow GET from the app's origin**
    (the PUT already needs it). **Limits:** whoever runs the app could ship a bundle that
    exfiltrates the passphrase (the stated limit of every web E2E scheme); a lost passphrase
    and recovery code loses the scan; a 20 MB scan is read into memory, sealed in one piece
    (WebCrypto has no streaming AES-GCM); legacy plaintext scans stay where they were until
    the owner presses Encrypt or copies the `filing/` prefix to a new bucket.
- Shared-file touches (additive only): `AppShell.tsx` (nav pill + the `short`
  labels the six-cell bottom nav needs), `icons.tsx` (`Cabinet`),
  `AppShellHost.tsx` (badge), `CommandPalette.tsx`, `src/lib/filingIntent.ts`,
  `icons.tsx` (`Clock`, `BarChart`).

## Notes feature (`/notes`)

*Jot it down, find it later, copy it out in one tap.* A self-contained pillar under
`src/features/notes/` + `/notes` (list) and `/notes/[id]` (editor). Imports no other
feature; nothing imports it — removable cleanly in both directions.

- **Phases.** 1: list, editor, smart lists, clipboard. 2: search + tags. 3: markdown.
  **4: locked notes** (per-note encryption, below). All four shipped.
- **Nothing is created before the account's cache has loaded.** The cache key is the
  session email, which arrives after mount; a note created in that gap was filed under
  the bare key and the editor (opening a beat later under the real one) said it didn't
  exist. Worse, in the render between the email arriving and its cache loading, a
  commit from the old list would replace the account's whole cache. So `useNotes`
  tracks *which* key it has loaded (`hydrated` means "this email's cache"), any change
  made before that reads the cache first, and the list's New/Paste/`N` wait on
  `status !== "loading" && hydrated`.
- Collections: `users/{uid}/notes/{noteId}` → `{ title, body, pinned, tags[], lock?,
  activity[], createdAt, updatedAt }`, `users/{uid}/notesVaults/{id}` (wrapped keys only —
  see locked notes below), and `users/{uid}/notesMeta/log` (the deletion log, below). Covered by the recursive owner rule; `FIRESTORE_RULES.md` says why a
  notes-specific rule would add nothing (rules OR together). Timestamps are the
  client's instant, not `serverTimestamp()` — a pending server time reads `null` in the
  local snapshot and would sink the note being typed to the bottom of the list.
- **Same sync model as filing**: per-user cache (`bookmarkdeck:notes:v1:{email}`) renders
  at once, the live subscription takes over when connected, every change is queued
  first (`durableSave`/`durableDelete`, above) and sent by `toUpload` on connect. The cache is written
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
- **The list is one flowing grid, and a note's first tag is its ribbon.** `NotesDashboard`
  renders pinned-then-rest in a single `auto-fill` grid (1 column on a phone, up to 4 wide).
  It used to be a "Pinned" grid then a "Notes" grid, which left a lone card at the start of
  each row on a wide screen; a pinned note is now marked by its filled pin and blue edge.
  `NoteCard` puts the first tag in a corner tab (top-right, with a hit area wider than the
  tab so it is easy to tap), shows up to two more as chips, and every card reserves the
  ribbon's height so titles line up across a row. **A tag's colour is derived, never
  stored** (`lib/tagColor.ts`: hash of the canonical tag → one of 8 fixed tones), so it is
  the same on every device and in the filter row, and colour is never the only signal — the
  tab always carries the name. The tone classes use only palette steps the theme map
  already declares (`themeTokens.test.ts` fails on any other). `e2e/notes-cards.spec.ts`.
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
- **Clipboard** (`@/lib/clipboard`, shared since the vault forms need it): `@capacitor/clipboard` when
  `Capacitor.isNativePlatform()`, falling back to `navigator.clipboard` on **any**
  native failure — the shell loads the live site, so a deploy reaches devices before a
  rebuilt app carries the plugin (see `CAPACITOR_IOS.md` §1).
- **The title is the one input above 16px.** `globals.css` forces every form control to
  16px with `!important` (iOS zoom-on-focus); an important base-layer rule outranks
  any utility, so the title's size is a `.bd-note-title` rule beside it.
- **Markdown** (`lib/markdown.ts` → `components/Markdown.tsx`) is a small parser of our
  own, not a library: it yields a tree the renderer turns into React elements, so **no
  HTML string ever reaches the DOM** (a pasted `<img onerror>` is text), links render
  only for `http(s)`/`mailto`/`tel` (`safeHref`), and no dependency is added. A
  deliberate subset — headings, paragraphs (single newlines kept as line breaks, as
  notes are written), fenced code, quotes, nested lists, tasks, rules, pipe tables;
  bold/italic/strike/code/links/bare URLs/escapes. A **bare `[ ] x` line is a task**,
  because the editor's list continuation writes it that way. Task items carry their
  **source line**, so ticking a box in Preview flips that line (`toggleTaskLine`) and
  autosaves like typing. Cards and search use **`toPlainText`** (syntax dropped, line
  structure kept), so "**milk**" matches "milk" and a card reads "☐ buy milk".
  Edit/Preview is per device (`bd:notes:view:v1`); a blank note always opens in Edit.
  The formatting toolbar and ⌘B/⌘I/⌘⇧X go through the same `TextEdit` +
  `execCommand` path as the list smarts, so ⌘Z undoes them. No ⌘K for links — that
  is the app-wide command palette.
- **Locked notes are end-to-end encrypted, per note, opt-in** (`@/lib/vault/vault`,
  `@/lib/vault/vaultSession`, `@/lib/vault/useVaults` — **shared with Filing**, see there:
  one vault, one passphrase, one unlock for both; the records stay under
  `users/{uid}/notesVaults`, a name that predates the sharing). Owner decision: lock *selected* notes
  with one notes passphrase, not the whole pillar — forgetting it costs only what was
  locked. **Envelope design:** one random AES-256-GCM data key per vault encrypts note
  bodies; the vault record (`users/{uid}/notesVaults/{id}`) stores that key only
  *wrapped*, twice — by PBKDF2-SHA256 (600k) of the passphrase and of a 160-bit
  recovery code shown once. A passphrase reset re-wraps; no note is re-encrypted.
  Ciphertext is bound to its note id (GCM additional data); GCM's tag is the
  wrong-passphrase check (nothing else stored). WebCrypto only — no dependency.
  **The stored iteration count is untrusted** (`vaultIterationLimits`): whoever controls
  the database controls it, and a reset used to re-wrap the new passphrase at whatever
  count the record carried — one iteration, if someone lowered it. Records outside
  600k–5M are refused, and every wrap uses `PBKDF2_ITERATIONS`. Not covered, by design:
  a server can replay an older ciphertext of the same note, or drop a note's lock
  (stated limits of a web app whose database you don't control).
  **Invariants:** a locked note's `body` is always `""` in state, cache and Firestore
  (`normalizeNote` blanks it on read, `updateNote` on write, and `toFirestore` *throws*
  on a locked note with a body — the plaintext lives only in the open editor's memory).
  Title and tags stay plaintext (stated in the setup copy) so the list and search work.
  **Keys live in memory only** (non-extractable `CryptoKey`s): reload, tab close, "Lock
  notes"/"Lock now" or 10 idle minutes lock again; before the keys drop, the open
  editor's pending typing is saved encrypted (`onBeforeLock`). Encrypted saves run
  serially, so a slow encryption can't land over a newer one, and each save records its
  own ciphertext→plaintext so the editor never mistakes its write for a remote change.
  **Vaults are never deleted** — a dropped vault is lost notes. Two devices that set one
  up offline end with two; each lock names its vault (`kid`) and unlock tries every
  vault. Setup waits for the cloud's answer (`ready`) so a second device doesn't start a
  second vault needlessly. A locked note is never auto-discarded as blank.
- Keys: `N` new note, `/` search, ⌘E Edit/Preview, Esc clears search or leaves the editor. An input that
  handles Esc itself `preventDefault`s it, and the editor's window handler skips a
  prevented Esc — that is how the tag box clears without closing the note.
- Size cap: `MAX_NOTE_CHARS` (300k UTF-16 units ≤ 900 KB UTF-8) keeps a note inside
  Firestore's 1 MiB document limit.
- **⌘K finds notes without importing the feature.** `@/lib/notesIndex` owns the notes
  cache key (`useNotes` imports it, so the two can't drift) and gives the palette a
  read-only summary of **the signed-in account's** cache only; a locked note is listed by
  title and tags, never body. Notes rank before bookmarks (the list is capped at 50).
  "New note" is an intent handoff (`setNewNoteIntent` → `NotesDashboard` consumes it once
  the cache is loaded), as `filingIntent` does.
- **Backup & export** (`lib/notesBackup.ts`, `NotesBackupDialog`). The JSON backup carries
  every note **as stored** — locked notes still encrypted — plus the vault records (wrapped
  keys only), so it restores on a fresh account and unlocks with the passphrase or
  recovery code while leaking nothing locked. Restore **merges by id and never deletes**;
  on a shared id the backup wins only if its `updatedAt` is newer, and existing vaults are
  never replaced. The Markdown export is for reading elsewhere, so locked notes appear by
  title only.
- **History and Insights** (`lib/activity.ts`, `lib/deletionLog.ts`, `lib/insights.ts`,
  `components/NotesInsights.tsx`). Each note carries `activity[]` — created, edited,
  pinned, tagged, locked, unlocked, restored, imported — **never content**, so it rides
  the note's own sync, cache and backup and needs no second sync path. Autosave saves every
  800 ms, so saves under 30 min apart fold into one "edited" entry (`n` saves, `from`);
  capped at 100 events a note, so it is recent history, not a ledger. A deleted note takes
  its history with it, so **deletions go to an account log** (`notesMeta/log`, mirrored in
  the device cache) that only ever grows by union, newest 100: removing an entry on Undo
  would be undone by another device's copy, so an undone delete stays listed and the note's
  own history reads "Restored". Offline deletes reach the cloud on `useDeletionLog`'s next
  merge. `computeInsights` is pure — totals, local-week buckets (Monday first; tests pin a
  zone), tags, most-edited, longest, untouched 180+ days and the audit feed — computed when
  the dialog opens and stored nowhere. Locked notes count, but not their words. Last
  writer wins per note, so two devices editing one note at once can drop each other's
  events, as with the note's text.
- **Edited on two devices → both kept** (`lib/conflicts.ts`). Each device remembers, per
  note, the cloud `updatedAt` it last saw (its *base*, `bookmarkdeck:notes:base:v1:{email}`,
  refreshed from every snapshot and every confirmed write). On reconnect, `planReconnect`
  checks each offline edit `toUpload` would push: if the cloud copy moved past this device's
  base and the text differs, the newer version keeps the note and the older is written as a
  new "(conflicted copy)" tagged `#conflict`, with a `conflict` history event, and the list
  toasts (`CONFLICTS_FOUND`). Before, the upload overwrote the other device's edit. **Not
  covered:** locked notes (ciphertext is bound to the note id, so a copy under a new id
  couldn't decrypt — they stay last-writer-wins), notes with no recorded base (edits made
  before this shipped), and two devices both online typing in the same note at once.
- Shared-file touches (additive): `AppShell.tsx` (nav entry; both navs omit the active
  pillar), `CommandPalette.tsx` + `@/lib/notesIndex` (⌘K), `icons.tsx` (`StickyNote`, `Copy`, `ClipboardPaste`, `Pin`, `Lock`, `Unlock`),
  `globals.css` (`.bd-note-title`).

## Pull request and push policy

Vercel Hobby allows 100 deployments/day, and every push to any branch triggers one.
Batch changes into as few pushes and PRs as possible.

- Commit locally as often as needed, but do NOT push after every commit.
- Never push or open a PR unless I explicitly ask.
- When I do ask, push once, with all accumulated commits together.
- Use one long-lived branch per feature or milestone (e.g. `feature-clock-in`),
  with one PR per branch. Do not create a new branch or PR per small fix.
- Before opening a PR, check for an existing one (`gh pr list --head <branch>`).
  If one exists, push to it instead of creating a new one.
- Follow-up fixes and review feedback go onto the same branch/PR as new commits,
  and are pushed together in a single push.
- Run lint, tests, and build locally before any push. Never use CI or Vercel
  deployments to find failures.

## Conventions

- File comments are sparse; match the surrounding density. `@/` is the `src/` alias.
- Follow existing patterns exactly; prefer the smallest diff to shared files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
