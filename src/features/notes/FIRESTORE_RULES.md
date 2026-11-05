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

## Firestore — covered by the owner rules ✅

All three are under `users/{uid}`, so the owner rules in `firestore.rules` already
limit them to their owner (this uid AND the owner's verified email).

**One notes-specific check lives in that same rule:** `lockedTextSealed` refuses a
write of a note whose `lock` is set and whose `body` isn't empty — even from the
owner. `toFirestore` already throws before sending one; the rule is the server's
copy of that line, for a client that doesn't. A separate `match
/users/{uid}/notes/{noteId}` block could not do it: rules are OR-ed — any matching
`allow` grants access — so a stricter block never narrows what another allows.

`npm run verify:rules:emulated` asserts it anyway, because notes hold free text:
the owner can create, read, update and delete a note; another signed-in uid can't
read, overwrite, create in or delete from someone else's notes; a signed-out
client can't read or write; a root-level `notes` collection is denied; and a locked
note with a plaintext body is refused, new or updated, while an empty body is accepted. Vaults get
the same owner / other-uid / anonymous checks.

Timestamps are written as the client's instant (`Timestamp.fromDate`), not
`serverTimestamp()`: the list orders by `updatedAt`, and a pending server
timestamp reads back as `null` in the local snapshot, which would drop the note
being typed to the bottom of the list.
