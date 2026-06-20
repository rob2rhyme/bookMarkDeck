# Focus feature — Firestore security rules

Security rules now live in a version-controlled, deployable file at the repo
root: **`/firestore.rules`** (with `firebase.json` + `.firebaserc`). That single
file is the source of truth — do not hand-edit rules only in the console.

The focus feature stores data in per-user subcollections:

- `users/{uid}/focusTasks/{taskId}`
- `users/{uid}/focusSessions/{sessionId}`
- `users/{uid}/focusSettings/{docId}` (single `settings` doc)
- `users/{uid}/focusJournal/{day}` (one doc per `YYYY-MM-DD` — holds the day's mood)
- `users/{uid}/focusNotes/{noteId}` (multiple timestamped notes per day)
- `users/{uid}/focusHydration/{day}` (cups drunk per `YYYY-MM-DD`)
- `users/{uid}/activity/{eventId}` (unified activity log)

These are all covered by the one owner-scoped recursive rule in `firestore.rules`:

```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

It also covers bookmarks/shortcuts (`users/{uid}` + `users/{uid}/bookmarkBackups`).

## Deploy

```
# one-time
npx firebase login

# deploy just the rules (and indexes)
npx firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into the Firebase console
(Firestore Database → Rules → Publish).

> Deploying **replaces** the entire console ruleset. All Bookmark Deck data
> lives under `users/{uid}`, so this owner rule is complete — but if you have
> other collections, add their rules to `firestore.rules` first.
