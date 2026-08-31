# Filing — Firestore rules

The Filing pillar (see `ANALYSIS-FILING-LOG.md`). Data lives under the
signed-in user's document, scoped by Firebase `uid`:

```
users/{uid}/filingPlaces/{placeId}         # nestable physical places
users/{uid}/filingParties/{partyId}        # whose paper it is
users/{uid}/filingFolders/{folderId}       # the folder you physically pull
users/{uid}/filingDocuments/{documentId}   # the paper
users/{uid}/filingSettings/settings        # settings doc
users/{uid}/filingDocs/{docId}             # attachment pointers (name, size, R2 key)
```

`filingDocs` holds POINTERS, not bytes: name, size, content type, the R2 object
key and its public URL. The objects themselves live in Cloudflare R2 under
`filing/{userSeg}/{documentId}/`, where `userSeg` is derived server-side from the
session subject and never client-supplied.

Two consequences worth stating. The **public bucket is a different origin** with
no Firestore rule over it — an object URL is unguessable but not access-
controlled, which is why SVG and HTML are refused at presign time and why a scan
should not be treated as a secret. And deleting a document removes its pointer
first, then the object: a failed object delete leaves an orphan nobody sees,
whereas the reverse would leave a row pointing at bytes that are already gone.

## Firestore — no change required ✅

These are subcollections of `users/{uid}`, so the existing recursive owner rule
already covers them. Confirm this block is present in the Firebase console /
`firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Firestore evaluates the **console-deployed** ruleset and no CI step deploys the
repo copy, so verify there after any rules change
(`firebase deploy --only firestore:rules`).

`npm run verify:rules` checks the repo copy against the Firestore emulator — 40
assertions covering owner access to every pillar's collections (nested paths
included), cross-uid denial on read/write/delete, anonymous denial, and that the
recursive rule doesn't leak outside `users/{uid}`. It needs Java and a running
emulator, so it isn't part of `npm test` or CI:

```
npx firebase emulators:start --only firestore --project rules-check
npm run verify:rules
```

A pass proves the **file** is right. It says nothing about what production is
serving — only a deploy does that.

## Sync — the same shape as the other pillars

Audited field-by-field against `features/inventory`, because "it saves locally
but never reaches the cloud" is the failure this pillar can least afford:

| | |
| --- | --- |
| Auth | `useFilingSync` is the same hook as `useInventorySync` — reflects an existing Firebase session silently via `onAuthStateChanged`, so the one Google sign-in that `FirebaseSyncBridge` performs lights up Filing with no second prompt. `connect()` is the interactive fallback. |
| Seeding | Every hook seeds local-only records to the cloud **then** attaches the listener, so records created before connecting aren't dropped by the first snapshot. Same ordering, same comment, as `useInventory`. |
| Writes | Every mutation is optimistic and writes through: add / update / archive / delete, plus the feature-specific ones (obligations, custody, shred receipts, `importMany`). |
| Coverage | All 60 fields across the four collections are written by the payload builders and read back by the mappers — no field is stored locally but silently dropped on the way to Firestore. |
| Settings | Fetched once on connect with a local-edit-wins `dirtyRef`, exactly like `useInventorySettings` and `useFocusSettings`. Neither of those subscribes either; a settings change on another device lands on the next connect. |
| Failures | Logged as `[filing] <noun> save failed:`, matching `[inventory] save failed:` — a rejected write (e.g. a document over Firestore's 1 MiB cap) has to be diagnosable rather than silent. |

Two things are deliberately device-local and never sync: the localStorage caches
(a per-user projection, rebuilt from the cloud copy) and
`bookmarkdeck:filing:push-message:v1`, which holds a QStash message id that only
means anything on the device that scheduled it.

## Two carve-outs worth stating plainly

**`confidential` is RESERVED, not shipped.** The field exists on
`FilingDocument` but nothing sets or reads it — there is no confidential toggle
in the UI. If one is ever added, understand what it can and cannot be: a UI gate
behind the device-local app lock, never a security boundary. Firestore sees one
owner, so anyone with access to the account sees everything. That matters most
for the client-file use case, where a solo practitioner may assume more
isolation than they actually have — say so in the guide at the same time as
shipping the toggle, not after.

**A "party" is a label, not a user.** `filingParties` records whose paper a
folder holds — "Mom", "Client: Acme". Nobody else signs in, nothing is shared
between accounts, and no rule grants another `uid` access. This is deliberately
**not** household multi-user, which `ENGAGEMENT-ROADMAP.md` records as ruled out.

## Removability

Deleting `src/features/filing/` plus the `/filing` route and its `DESTINATIONS`
entry removes the pillar. It imports no other feature, and no other feature
imports it — the same one-folder-extraction property
`MYSTUFF-DECOUPLING-READINESS.md` protects for My Stuff. The collections above
are namespaced `filing*` and can be deleted independently.
