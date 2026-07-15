# Inventory ("My Stuff") — Firestore & Storage rules

Phase 1 of the inventory pillar (see `INVENTORY-ROADMAP.md`). Data lives under
the signed-in user's document, scoped by Firebase `uid`:

```
users/{uid}/inventoryItems/{itemId}
users/{uid}/inventoryLocations/{locationId}
users/{uid}/inventorySettings/settings
users/{uid}/inventoryDocs/{docId}          # receipt/manual attachments (per item)
users/{uid}/inventoryWishlist/{wishId}     # "want to buy" list (separate from owned items)
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

If your project scopes rules per-collection instead of with the recursive
wildcard, add the three collections explicitly:

```
match /users/{uid}/inventoryItems/{itemId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
match /users/{uid}/inventoryLocations/{locationId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
match /users/{uid}/inventorySettings/{doc} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
match /users/{uid}/inventoryWishlist/{wishId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

Only **add** rules for these new collections — never loosen existing ones.

> **App-lock is intentionally *not* here.** The My Stuff privacy lock (PIN hash +
> optional WebAuthn credential id) is device-bound and lives only in per-user
> `localStorage` — it is deliberately never written to Firestore, so it needs no
> rule. Don't "sync" it later; a lock belongs on the device, not in the cloud.

## Firebase Storage — deferred (Blaze-gated) ⏳

Phase 1 stores photos as direct URLs the user pastes (no upload). The
`ItemPhoto` shape already carries an optional `path`, so when Firebase Storage
is enabled (requires the Blaze plan — one of the open go/no-go decisions in the
roadmap), add a **separate** `storage.rules` ruleset and wire it in
`firebase.json`:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/inventory/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.size < 8 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

At that point the client compresses (`~1600px`, WebP ~0.8) and uploads to
`users/{uid}/inventory/{itemId}/{photoId}.webp`, then stores `{ id, path, w, h }`
on the item and renders via `getDownloadURL`.
