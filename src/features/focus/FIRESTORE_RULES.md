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
- `users/{uid}/todos/{id}` (to-do items with optional due date)
- `users/{uid}/activity/{eventId}` (unified activity log)
- `users/{uid}/focusContent/content` (per-user extra quotes/nuggets/challenges,
  merged on top of the built-in defaults)
- `users/{uid}/focusScores/{id}` (one doc per answered "Need a push?" quiz —
  points + per-topic breakdown for the Scores history)
- `users/{uid}/meditationSessions/{id}` (one doc per completed meditation —
  `{ minutes, kind, pattern?, day, createdAt }`)
- `users/{uid}/letThemResets/{id}` (one doc per "Let them" reset —
  `{ trigger, action, day, createdAt }`)
- `users/{uid}/prefs/ui` (cloud-remembered one-shot UI flags — welcome /
  habit-onboarding dismissals; see `src/lib/uiPrefs.ts`)

These are all covered by the owner rules in `firestore.rules` (this uid AND the owner's verified email; one
wildcard over every collection under `users/{uid}`, so a new one needs no rule).

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
