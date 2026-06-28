# ANALYSIS — Home Inventory App

Deep analysis for adding a **Home Inventory** capability to this project.
Companion to `FOCUS-INTEGRATION.md`; defers to `CLAUDE.md` for the stack of
record. No code written yet — scoping pass requested before any build.

## 1. What's being proposed

A place to catalog household belongings: items with a name, category/room,
quantity, value, purchase date, warranty/serial, a photo, and notes — for
insurance, moving, decluttering, or "do I already own this?" lookups. Typical
views: by room, by category, total value, search, and export.

## 2. The honest fit question (read this first)

Bookmark Deck's north star (`FOCUS-INTEGRATION.md`) is explicit:

> *A calm home base for focused work… Bookmarks feed the work · focus is the
> work · stats are the proof.* **Connection over breadth.**

A home inventory is a **different domain** — asset tracking, not focused work or
resource curation. It does not feed focus sessions, and nothing in focus/habits
feeds it. So unlike Meditation Guides (the recovery half of focus, see
`ANALYSIS-MEDITATION-GUIDES.md`), this one **does not pass the north-star test
as a core pillar.** That's not a "no" — it's a fork in the road that's the
owner's call, because the codebase *can* host it cleanly. The three honest
options are below.

## 3. Does the architecture support it? Yes, cleanly.

Everything an inventory needs already exists in the stack — no new infrastructure:

| Need | Reuse |
| --- | --- |
| Auth/gating | next-auth session + Firebase Auth (the dual-layer; **no second auth**) |
| Per-user data | Firestore subcollection `users/{uid}/inventory/{id}` |
| State pattern | a `useInventory` hook that owns state, hydration-safe, localStorage cache + explicit cloud sync (exactly like `useBookmarks`/`useFocusTasks`) |
| Routing/shell | a route group page under `(app)`, wrapped by `AppShell` |
| Photos | the trade-off below — this is the one genuinely new concern |
| Import/export | JSON round-trip like the focus/habits backups; CSV like `sessionsToCsv` |

**The one new dependency decision is images.** Firestore is for structured data,
not blobs. Options, cheapest-first:
- **No photos (v1)** — text + emoji/category icon only. Zero new infra. Recommended start.
- **Firebase Storage** — the native fit, but it's a **new product surface** with
  its own console security rules and bucket config (and cost). A real addition.
- **Data-URL thumbnails in Firestore** — avoid; bloats docs and risks the 1 MB
  document limit. Don't.

## 4. Data model (if built)

- **`users/{uid}/inventory/{id}`** — `{ name, category, room, quantity, value,
  currency, purchasedAt, serial, warrantyUntil, note, photoPath?, tags[],
  createdAt, updatedAt }`. Written with `setDoc(..., { merge: true })`.
- **`users/{uid}/inventory_meta/rooms`** / `…/categories` — small lookup lists,
  or just derive from items.
- **Console security rule** (no `firestore.rules` file in repo — paste into the
  Firebase console, owner-scoped like every other collection):

```
match /users/{uid}/inventory/{doc} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

There is a real **conceptual overlap with bookmarks/folders**: items-in-rooms is
structurally the same as bookmarks-in-folders (nestable `parentId`). If built,
*reuse the folder mental model and UI idioms* rather than inventing a parallel
one — that's the only way this earns "connection over breadth."

## 5. Three options (the decision)

1. **Don't build it here.** Keep Bookmark Deck focused; if you want an inventory,
   it's a separate app. Lowest risk to product coherence. *Default recommendation.*
2. **Build it as an isolated, removable feature** — the `src/features/focus/`
   precedent: self-contained under `src/features/inventory/` + an `/inventory`
   route, additive-only touches to shared files (a nav pill, an icon), no photos
   in v1. Clean to add, clean to delete if it doesn't earn its keep. Pick this
   only if you personally want the tool and accept it sits *beside* the north
   star, not on it.
3. **Generalize "collections."** Bookmarks already have nestable folders. A more
   ambitious path is a generic "things in nestable folders" core that powers both
   bookmarks and inventory. High design cost, high regression risk to the
   shipping bookmarks feature — **not recommended** now.

## 6. Effort & risks

- **Effort:** Option 2 (no photos) is medium — ~2–3 focused slices (model+hook,
  list/room views + search, import/export). Add Firebase Storage later only if
  photos prove necessary (its own slice + console setup + cost).
- **Risks:**
  - *Product dilution* — the main risk. A second unrelated domain makes the app
    "an everything bucket," which the north star explicitly resists.
  - *Photos = new infra* — Firebase Storage is a genuine new surface (rules,
    cost, CSP `img-src`/`connect-src` updates in `next.config.ts`). Defer it.
  - *Maintenance surface* — more collections, more backup/export paths, more rules
    to keep owner-scoped.

## 7. Recommendation

**Default: don't add it to Bookmark Deck** — it fails the north-star test and
risks turning a focused tool into a catch-all. The codebase *could* host it
well (Option 2, isolated like the focus feature, no photos in v1) if you simply
want the tool for yourself and accept it as a deliberate side-feature rather than
a pillar. If we proceed, do it as a removable `src/features/inventory/` slice,
reuse the folder/`parentId` model, and keep photos out of v1. **Decide the
strategic question before any code.**
