# Habits — Firestore paths & rules

The habits feature stores per-user data under `users/{uid}`:

```
users/{uid}/habits/{habitId}                     # habit definitions
users/{uid}/habitEntries/{habitId}_{YYYY-MM-DD}  # per-day logs (deterministic id)
```

## Security rules — no change required

The repo's root `firestore.rules` already covers these with its owner rules
(this uid AND the owner's verified email, over every collection under
`users/{uid}`), so the new
`habits` and `habitEntries` subcollections are covered automatically. Deploy
with:

```
npx firebase deploy --only firestore:rules
```

## Indexes

MVP queries are single-field only — the entries listener uses a bounded
`where("day", ">=", <cutoff>)` range, which Firestore auto-indexes. No composite
index is needed yet.

When per-habit history queries are added later
(`where("habitId","==",id) orderBy("day","desc")`), add this to
`firestore.indexes.json` first (or they throw `FAILED_PRECONDITION` in prod):

```json
{
  "collectionGroup": "habitEntries",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "habitId", "order": "ASCENDING" },
    { "fieldPath": "day", "order": "DESCENDING" }
  ]
}
```

## Removability

Everything lives under `src/features/habits/` + the `/habits` route. Shared-file
touches are additive only: a nav entry in `AppShell.tsx`, a `Repeat` icon in
`icons.tsx`, two members on the `ActivityType` union (+ `TYPE_META`) in the focus
feature, and the `/habits` route file. Deleting the feature = remove the folder,
the route, and those additive lines.
