# FOCUS-INTEGRATION.md — focus hub integration plan

Plan for growing bmarkdeck into a focused-work hub, one validated slice at a time.
Derived from the repo survey (Phase 0). See `CLAUDE.md` for the stack of record.
Companion source doc: `FOCUS-HUB-PROMPTS.md` (the phased prompts + gated backlog).

## North star

> A calm home base for focused work: the resources you reference (**bookmarks**), the sessions
> where you do the work (**focus**), and a record of what you got done (**stats**).
> Bookmarks feed the work · focus is the work · stats are the proof.

Every feature earns its place against that sentence. **Connection over breadth** — the link
between a bookmark *folder* and a focus session (Phase 4) matters more than any standalone feature.

## Confirmed: reuse what's here, add nothing redundant

- **Auth:** reuse the existing **next-auth** session (gating) + **Firebase Auth** (Firestore
  access). No second auth system.
- **Database:** reuse **Firestore**. **No Supabase. No SQL. No migrations. No RLS.**
- The three realities, in writing:
  1. **Firestore (NoSQL):** persistence = **new collections + console-managed security rules**,
     not table migrations. There is no `firestore.rules` file in the repo (see CLAUDE.md).
  2. **No automated test suite:** "verify" = `lint` + `typecheck` + `build` + manual smoke.
  3. **Not yet a PWA:** no manifest/service worker. (PWA is backlog item **B4**.)
- **Do not touch** the Electron `launcher-desktop/` app or the Google Drive sync path.

## Rules of engagement (every phase)

1. Work on a **`feature/focus`** branch off a clean tree — never `main`.
2. **Additive only:** all focus code under one feature folder + the `/focus` route namespace;
   new Firestore collections. Don't rename/move/delete existing files.
3. **Never weaken existing security.** Only *add* rules for new collections; never loosen
   existing ones. Provide proposed rule text for the user to apply in the Firebase console.
4. **Smallest diff to any shared file** (nav/`AppShell`, layout, auth config), **shown for
   approval before applying.**
5. Reuse the existing session + Firestore. No second auth/db.
6. **Verify after every phase:** `lint` + `typecheck` + `build`, then manually confirm login,
   bookmark sync, Drive sync, and the desktop launcher still work. On any regression: **stop,
   report, propose a revert** — don't push on.
7. Keep the feature **isolated** under one folder/route namespace, removable cleanly.

## Integration shape

- **Route namespace:** `/focus`, placed at **`src/app/(app)/focus/`** so it inherits the
  `(app)` layout (`AppShell` + `GlobalClientUI`) and the authenticated route group.
- **Auth gating:** mirror `src/app/(app)/page.tsx` — server component does
  `getServerSession(authConfig)` and `redirect("/login")` when absent.
- **Feature folder:** **`src/features/focus/`** for all focus components/hooks/lib
  (`components/`, `hooks/`, `lib/`, `data/`). Keeps the blast radius to one directory.
- **Data layer:** `src/features/focus/data/*` mirrors `firestoreShortcuts.ts` — call
  `ensureFirebaseGoogleAuth(emailHint)`, then read/write under the user's `uid`. Hooks follow
  the hooks-own-state + `hydrated`-flag + localStorage-cache pattern; cloud sync explicit.
- **Styling:** Tailwind v4 with the existing slate/blue dark tokens (see CLAUDE.md).

### Shared files we expect to touch (each: smallest diff, approval first)
| File | Change | Phase |
|---|---|---|
| `src/components/AppShell.tsx` | add ONE nav entry/link to `/focus` in the header | 1 |
| (folder/collection view component) | add a "Start a focus session" deep-link action | 4 |
| `next.config.ts` | (Phase 0b only) add security headers | 0b |

No other existing files should need edits for the core slice.

### New Firestore collections (namespaced `focus_*`)
Scoped per user by `uid`; each needs a console security rule before production use.
- `focus_settings` — timer durations, sessions-until-long-break, sound/auto-start toggles. *(B2)*
- `focus_tasks` — current-session task list. *(Phase 3)*
- `focus_sessions` — one document per completed focus block (`{ uid, startedAt, focusMin,
  linkedFolderId? }`). *(Phase 3; `linkedFolderId` added in Phase 4)*
- Later: `focus_journal` *(B8)*, `focus_calendar_tokens` *(B7)*, `focus_push_subscriptions` *(B6)*.

Storage decision (Phase 3): prefer **subcollections under `users/{uid}/`** (e.g.
`users/{uid}/focus_sessions/*`) for session/task lists so they're queryable per user and reuse
the existing `users/{uid}` ownership rule shape; settings may be a single
`users/{uid}/focus/settings` doc. Finalize when implementing.

### The hub link (Phase 4 — the thesis)
"Collection" = a **folder**. A focus session can optionally link a folder; during the session
its bookmarks (`bookmarks.filter(b => b.folderId === folder.id)`) show in a side panel. Bookmark
data is read **read-only** through the existing layer — never modify bookmark data or its rules.
A folder view gets a "Start a focus session" action that deep-links to `/focus?collection=<id>`.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Survey + write `CLAUDE.md` + this doc | ✅ done (docs only, no code) |
| 0b | Security headers + `audit` script + `.env.example` (optional, parallel) | ⏳ not started |
| 1 | `feature/focus` branch + isolated auth-gated `/focus` shell + 1 nav entry | ✅ done (placeholder route + Focus nav pill in AppShell) |
| 2 | Timer + tasks UI (in-memory, design-harmonized) | ⏳ |
| 3 | Persist focus data via Firestore (+ console rules) | ⏳ |
| 4 | ⭐ Focus-on-a-collection (bookmarks↔focus link) | ⏳ |
| 5 | Review, smoke test, merge the core slice | ⏳ |
| B1–B9 | Gated backlog (stats, settings, chimes, PWA, hydration, push, calendar, journal, suggestions) | gated |

**After Phase 5: stop and watch.** Real usage of the focus loop + collection link gates Part 2.

## Manual (dashboard) steps — only when their phase comes
- Phase 3+: add Firestore security rules in the Firebase console (Claude provides the rule text).
- B7: enable Google Calendar API + add `calendar.readonly` via **incremental** OAuth (base login
  untouched). B6: generate VAPID keys → `.env.local`. Secrets only in the gitignored env file.
