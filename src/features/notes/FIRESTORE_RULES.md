# Notes — Firestore rules

```
users/{uid}/notes/{noteId}         # { title, body, pinned, tags[], lock, activity[], createdAt, updatedAt }
users/{uid}/notesVaults/{vaultId}  # { v, createdAt, pass:{salt,iv,ct,iterations}, recovery:{…} }
users/{uid}/notesMeta/log          # { deleted: [{ id, title, at }] } — the deletion log
```

A **locked** note stores `body: ""` and `lock: { kid, iv, ct }` — its body encrypted on
the device (AES-256-GCM). A vault holds only salts, IVs and the data key *wrapped* by
the passphrase and by the recovery code (PBKDF2-SHA256, 600k); nothing in either
collection opens a locked note without one of those. See `lib/vault.ts`.

## Firestore — no change required ✅

All three are under `users/{uid}`, so the existing recursive owner rule in
`firestore.rules` already limits them to their owner:

```
match /users/{uid}/{document=**} {
  allow read, write: if isOwner(uid); // this uid AND the owner's verified email — see firestore.rules
}
```

A `match /users/{uid}/notes/{noteId}` block of its own would add nothing. Rules
are OR-ed — any matching `allow` grants access — so a stricter notes rule could
never narrow what the recursive rule already allows. It could only widen it.

`npm run verify:rules:emulated` asserts it anyway, because notes hold free text:
the owner can create, read, update and delete a note; another signed-in uid can't
read, overwrite, create in or delete from someone else's notes; a signed-out
client can't read or write; and a root-level `notes` collection is denied. Vaults get
the same owner / other-uid / anonymous checks.

Timestamps are written as the client's instant (`Timestamp.fromDate`), not
`serverTimestamp()`: the list orders by `updatedAt`, and a pending server
timestamp reads back as `null` in the local snapshot, which would drop the note
being typed to the bottom of the list.
