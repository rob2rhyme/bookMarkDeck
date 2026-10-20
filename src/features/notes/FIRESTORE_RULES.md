# Notes — Firestore rules

```
users/{uid}/notes/{noteId}   # { title, body, pinned, tags[], createdAt, updatedAt }
```

## Firestore — no change required ✅

`notes` is a subcollection of `users/{uid}`, so the existing recursive owner rule
in `firestore.rules` already limits it to its owner:

```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

A `match /users/{uid}/notes/{noteId}` block of its own would add nothing. Rules
are OR-ed — any matching `allow` grants access — so a stricter notes rule could
never narrow what the recursive rule already allows. It could only widen it.

`npm run verify:rules:emulated` asserts it anyway, because notes hold free text:
the owner can create, read, update and delete a note; another signed-in uid can't
read, overwrite, create in or delete from someone else's notes; a signed-out
client can't read or write; and a root-level `notes` collection is denied.

Timestamps are written as the client's instant (`Timestamp.fromDate`), not
`serverTimestamp()`: the list orders by `updatedAt`, and a pending server
timestamp reads back as `null` in the local snapshot, which would drop the note
being typed to the bottom of the list.
