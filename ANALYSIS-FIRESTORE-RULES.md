# ANALYSIS — Rewriting the Firestore rules for strangers (2026-11-05)

Owner question, on `SECURITY-LAUNCH-PLAN.md` §3.1: *should the rules drop the email
allowlist? Need more review — do thorough research.* Owner's answer: keep the
allowlist; build the two lock invariants (done: `lockedTextSealed` in `firestore.rules`,
14 emulator assertions; 84 in all since the bookmark library chunks). The rest stays a plan until sign-in opens. Merging a rules change to `main` **is** a production deploy
(`.github/workflows/firestore-rules.yml`), so this document comes before any code.

## Recommendation

1. **Keep the email allowlist until the day sign-in opens.** It is the only thing that
   stops any Google account from using this project as free storage through the public
   web config. Dropping it early protects nothing and exposes everything below.
2. **When sign-in opens, replace it with a server-issued membership claim, not
   "any verified email".** next-auth already decides who may sign in; the server should
   tell Firebase the same answer (Admin SDK). The rules then read
   `request.auth.uid == uid && request.auth.token.member == true`.
3. **Do not add per-field type or size validation.** The write shapes (below) make it
   unsafe, and a refused write is *silently dropped* by the offline queue. Validate only
   the two security invariants the client already enforces (locked text never in
   plaintext).
4. **The kill switch is the claim plus Firebase Auth's own disable**, not an
   `admin/users/{uid}` document read on every request. Add the document only if a
   cut-off of under an hour is ever needed.
5. Cost control is outside the rules: find out whether the project is on Spark or Blaze,
   set budget alerts, and turn on App Check in monitor mode before enforcing it.

## What the allowlist does today

`isOwner(uid)` = signed in, `auth.uid == uid`, `email_verified`, and the email in
`allowedEmails()`. The Firebase web config is public by design (it ships in every page),
and Firebase Auth's Google provider lets *any* Google account create a Firebase user.
Without the email check, anyone can sign in from a script with that config and write
under their own `users/{uid}` — any collection name (the match is a wildcard), any
number of documents, up to 1 MiB each. Our app is not needed for any of it.

What that costs depends on the plan, which this repo cannot see:

| Plan | Over the free quota | Effect of abuse |
|---|---|---|
| Spark (free) | Requests fail with `RESOURCE_EXHAUSTED` until the daily reset | Nothing billed, but the owner's app stops working too |
| Blaze (paid) | Billed, no cap | Firestore is **not** among the products Firebase spend caps cover; budget alerts only notify |

So "uid + verified email" is right *for a public product*, and is a door left open for
a private one. The monetization plan already orders it this way: step 1 is "allowlist
→ sign-in + deny list; rules to uid". The rules change belongs in the same release that
opens sign-in, not before it.

## Why a claim, not "any verified email"

With `uid + email_verified`, the Firestore gate and the app gate are different gates:
next-auth can refuse someone (deny list, waitlist, unpaid) while Firestore still lets
them in through the SDK. A claim makes them one gate.

- **How it gets there.** Two ways, both needing `firebase-admin` and a service account
  in Vercel's env (which §3.5, account deletion, brings in anyway):
  - `setCustomUserClaims(uid, { member: true })` on the user Google sign-in created,
    then the client forces a token refresh; or
  - **better:** the server mints a custom token (`createCustomToken(uid, { member: true })`)
    from the next-auth session and the client calls `signInWithCustomToken`. Firebase's
    Google provider can then be **turned off**, so there is no self-sign-up surface at
    all. That matters, because blocking sign-up for Google in Firebase is not
    dependable: FirebaseUI's `disableSignUp` was reported not to stop Google
    sign-ups, and the console's "user account creation" switch is documented only
    in community answers, not official docs. The owner's
    existing uid is kept by looking it up (`getUserByEmail`) before minting. It also
    retires the bridge's dependency on whitelisting next-auth's client id in Firebase.
    **Needs a spike before it is promised:** whether a custom-token ID token still
    carries `email`/`email_verified` for a user created through Google (the rules would
    stop depending on them, so either answer works, but the copy in `CLAUDE.md` changes).
- **Cost.** A claim is in the token: no extra document read, unlike `get()`/`exists()`,
  which are billed as reads on every request (even denied ones), with a limit of 10 per
  request (20 in batches and transactions).
- **Staleness.** A token lives up to an hour. Removing the claim, disabling the user and
  revoking refresh tokens stops new tokens at once; the current one runs out within an
  hour. For a monthly-billed product that is fine. An `admin/users/{uid}` flag checked
  with `get()` would cut off at once, at one extra billed read per request.

## Why not per-field validation

The inventory of every write path (30 paths, all client-side; no server writes) found:

- **The offline queue drops refused writes.** `isPermanentWriteError` treats
  `permission-denied` and `invalid-argument` as final (`src/utils/pendingDeletes.ts:150`);
  `durableSave` and `replayUpserts` then take the record off the queue. Most callers
  swallow the error (Notes shows one toast). A rule stricter than the app means the
  user's edit is lost with no trace.
- **Merge writes.** Thirteen paths write with `merge: true`, so `request.resource.data`
  is the old fields plus the new ones. A new cap would refuse every later edit of a
  record that already exceeds it — the record becomes uneditable, and each edit is lost.
- **Types already vary on one field.** `createdAt` is a server Timestamp on first write
  and an ISO string on every rewrite (mappers read it back as a string), on 13 paths.
- **Open shapes.** Filing's activity and obligation maps are spread from memory
  (`{...a}`), so `keys().hasOnly()` would refuse any field added later without a rules
  change in the same deploy.
- **Most text has no bound in code** (titles, notes, tags, links, todo text, item
  fields). The bounds that do exist are often UI-only (note body 300k, habit note 280,
  photo data-URLs 700 KB) and not in the write path.
- **It would not stop abuse anyway.** Rules cannot see document count or total bytes,
  and Firestore already caps a document at 1 MiB. A stranger with a valid claim writes
  more documents instead of bigger ones. Who holds a claim is the control.

**What is worth enforcing**, because the client already guarantees it and a breach is a
privacy failure rather than a size one:

- `notes`: a document with a non-null `lock` has `body == ""`.
- `filingDocuments`: a document with a non-null `lock` has no `reference` or `note`.

Both writers replace the whole document and throw before sending a violating one, so no
legitimate write can be refused.

**Optional:** replace the collection wildcard with the 30 known collection names. Cheap, and it
stops arbitrary collections, but not volume. It is safe only with a test that fails when
a path in the source is missing from the rules (an extension of
`src/lib/firestorePaths.test.ts`) — otherwise the next new collection is refused and its
writes dropped.

## Cost and abuse controls outside the rules

- **Budget alerts** on the Cloud billing account (notify only). Google documents a
  Pub/Sub-triggered function that disables billing at a threshold; it stops everything,
  so it is a last resort.
- **App Check** (reCAPTCHA Enterprise, invisible on the web): only this app's pages get
  tokens, so a script with the public config is refused. Run it unenforced first and
  watch the metrics; enforcement takes up to 15 minutes to apply. 10,000 assessments a
  month are free. It raises the cost of abuse; it does not stop a real browser.
- **A dedicated Firebase project** (§3.3) so a stranger's usage and the owner's personal
  data never share a quota, a bill or a set of IAM roles.

## Found on the way (not rules, worth fixing)

- ~~**Oversized documents fail the same silent way.**~~ *(fixed: `@/lib/docSize`; see
  CLAUDE.md.)* The realistic paths were an item whose notes push it past the limit, a long
  locked note (base64 ciphertext is a third larger than the 300k-character cap allows
  for), and a bookmark library past 1 MiB. The item form's own 700 KB photo budget turned
  out to fit beside a full 300-entry history.
- `appendDeletion` writes the full title; the 200-character trim happens only in
  `saveDeletions`.
- The root `users/{uid}` doc's `version` is written as `2` by bookmarks and `1` by
  shortcuts. Nothing reads the cloud copy's `version`, so it is harmless, but misleading.

## Test and deploy plan (when it is built)

- Emulator assertions, added to `scripts/verify-firestore-rules.mjs`: claim holder reads
  and writes own tree; no claim → denied even own tree; another uid → denied; claim
  removed → denied; anonymous → denied; locked note with a body → denied; locked paper
  with a reference → denied.
- Every real payload builder (`toFirestore`, `documentPayload`, `itemPayload`,
  `habitToDoc`, …) run through the emulator once, so a rule can't refuse what the app
  actually sends.
- Ship order: claim minting deployed and verified on the owner's account **first**
  (rules unchanged), then the rules change in its own PR. Rollback is reverting that PR;
  the console also keeps the previous ruleset.

## Decisions

- Keep the allowlist for now — **decided, kept.**
- Lock invariants in the rules now — **decided, built.** Asserted with payload shapes
  copied from the two builders, not the builders themselves (they import the app's
  Firestore module, whose sentinels the test SDK's copy refuses). Mutation-checked:
  with the check disabled, exactly its five refusals fail.
- Still open: which plan is `unified-project-440e5` on? (console → Usage and billing)
- Still open, at launch: claim via custom token (spike first) or via `setCustomUserClaims`?

Sources: Firebase docs on rules limits, custom claims, App Check, Auth user actions and
billing, via search (firebase.google.com is not reachable from the build sandbox):
- <https://firebase.google.com/docs/firestore/security/rules-conditions>
- <https://firebase.google.com/docs/auth/admin/custom-claims>
- <https://firebase.google.com/docs/app-check>
- <https://docs.cloud.google.com/firestore/docs/understand-error-codes>
- <https://cloud.google.com/billing/docs/how-to/notify#cap_disable_billing_to_stop_usage>
- FirebaseUI Google sign-up report: <https://lightrun.com/answers/firebase-firebaseui-web-setting-signinoptionsdisablesignupstatus--true-for-googleauthprovider-still-allows-new-users->
