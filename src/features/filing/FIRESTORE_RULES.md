# Filing — Firestore rules

Phase 1 of the Filing pillar (see `ANALYSIS-FILING-LOG.md`). Data lives under the
signed-in user's document, scoped by Firebase `uid`:

```
users/{uid}/filingPlaces/{placeId}         # nestable physical places
users/{uid}/filingParties/{partyId}        # whose paper it is
users/{uid}/filingFolders/{folderId}       # the folder you physically pull
users/{uid}/filingDocuments/{documentId}   # the paper
users/{uid}/filingSettings/settings        # settings doc
users/{uid}/filingDocs/{docId}             # scans/photos, per document (Phase 6)
```

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

## Two carve-outs worth stating plainly

**`confidential` is a UI gate, not a security boundary.** Marking a document
confidential hides it behind the device-local app lock. Firestore still sees one
owner: anyone with access to the account sees everything. That matters most for
the client-file use case, where a solo practitioner may assume more isolation
than they actually have. Say so in the guide, not just here.

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
