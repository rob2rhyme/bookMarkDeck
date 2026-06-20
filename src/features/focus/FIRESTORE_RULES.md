# Focus feature — Firestore security rules

This repo has **no `firestore.rules` file**; rules are managed in the Firebase
console (Firestore Database → Rules). The focus feature stores data in two
per-user subcollections:

- `users/{uid}/focusTasks/{taskId}`
- `users/{uid}/focusSessions/{sessionId}`
- `users/{uid}/focusSettings/{docId}` (single `settings` doc)

## What to add (additive — do NOT remove existing rules)

Inside your existing `match /databases/{database}/documents { … }` block, add:

```
// Focus feature — owner-only access to per-user focus data.
match /users/{uid}/focusTasks/{taskId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
match /users/{uid}/focusSessions/{sessionId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
match /users/{uid}/focusSettings/{docId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

Then **Publish** in the console.

## Note

If your existing rule for `users` already uses a recursive owner-scoped
wildcard, e.g.

```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

then these subcollections are **already covered** and no change is needed —
adding the explicit blocks above is harmless and just makes the focus data
access intent clear. Never loosen the existing condition.
